//! The `glint://` scheme the frontend loads images from.
//!
//! `glint://localhost/<encoded path>` returns the image: as is when the WebView can draw it, as PNG
//! when Glint decodes it. `?thumb` returns a small preview. Only files recognized as images are
//! served.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use percent_encoding::percent_decode_str;
use tauri::http::{header, Request, Response, StatusCode, Uri};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use crate::formats::{self, Format};

const THUMB_SIZE: u32 = 360;
const THUMB_CACHE_ENTRIES: usize = 600;

type ThumbKey = (PathBuf, u64, Option<SystemTime>);

#[derive(Default)]
pub struct ThumbCache {
    entries: Mutex<HashMap<ThumbKey, (Vec<u8>, &'static str)>>,
}

pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    let uri = request.uri().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let response = match serve(app.state::<ThumbCache>().inner(), &uri) {
            Ok((body, mime)) => Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header(header::CACHE_CONTROL, "max-age=3600")
                .body(body),
            Err((status, message)) => Response::builder()
                .status(status)
                .header(header::CONTENT_TYPE, "text/plain")
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(message.into_bytes()),
        };
        responder.respond(response.unwrap_or_else(|_| Response::new(Vec::new())));
    });
}

pub fn path_from_uri(uri: &Uri) -> Option<PathBuf> {
    let encoded = uri.path().trim_start_matches('/');
    let decoded = percent_decode_str(encoded).decode_utf8().ok()?;
    if decoded.is_empty() {
        return None;
    }
    Some(PathBuf::from(decoded.as_ref()))
}

fn serve(cache: &ThumbCache, uri: &Uri) -> Result<(Vec<u8>, &'static str), (StatusCode, String)> {
    let path = path_from_uri(uri).ok_or((StatusCode::BAD_REQUEST, "no path".into()))?;
    let thumb = uri.query().is_some_and(|q| q.split('&').any(|p| p == "thumb"));
    let meta = std::fs::metadata(&path).map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;
    let key = (path.clone(), meta.len(), meta.modified().ok());
    if thumb {
        if let Some(hit) = cache.entries.lock().unwrap().get(&key) {
            return Ok(hit.clone());
        }
    }
    let bytes = std::fs::read(&path).map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;
    let format = formats::detect(&path, &bytes[..bytes.len().min(4096)]).ok_or((StatusCode::UNSUPPORTED_MEDIA_TYPE, "not an image".into()))?;
    if thumb {
        let result = make_thumb(&path, bytes, format)?;
        let mut entries = cache.entries.lock().unwrap();
        if entries.len() >= THUMB_CACHE_ENTRIES {
            entries.clear();
        }
        entries.insert(key, result.clone());
        return Ok(result);
    }
    full(bytes, format)
}

fn full(bytes: Vec<u8>, format: Format) -> Result<(Vec<u8>, &'static str), (StatusCode, String)> {
    if formats::webview_native(format) {
        return Ok((bytes, formats::mime(format)));
    }
    let image = formats::decode(&bytes, format).map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e))?;
    let png = formats::encode_png(&image).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok((png, "image/png"))
}

fn make_thumb(_path: &Path, bytes: Vec<u8>, format: Format) -> Result<(Vec<u8>, &'static str), (StatusCode, String)> {
    // Small files and formats only the WebView can read are cheaper to show as they are.
    if !formats::rust_decodable(format) || (bytes.len() < 96 * 1024 && formats::webview_native(format) && format != Format::Gif) {
        return full(bytes, format);
    }
    match formats::thumbnail(&bytes, format, THUMB_SIZE) {
        Ok(result) => Ok(result),
        Err(_) if formats::webview_native(format) => full(bytes, format),
        Err(e) => Err((StatusCode::UNPROCESSABLE_ENTITY, e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_windows_and_unix_paths_from_uris() {
        let uri: Uri = "http://glint.localhost/C%3A%5CUsers%5Cme%5CBilder%20%C3%BC%5Ca.png?v=1".parse().unwrap();
        assert_eq!(path_from_uri(&uri), Some(PathBuf::from("C:\\Users\\me\\Bilder ü\\a.png")));
        let uri: Uri = "glint://localhost/%2FUsers%2Fme%2Fa%23b.svg".parse().unwrap();
        assert_eq!(path_from_uri(&uri), Some(PathBuf::from("/Users/me/a#b.svg")));
        let uri: Uri = "glint://localhost/".parse().unwrap();
        assert_eq!(path_from_uri(&uri), None);
    }

    #[test]
    fn serves_images_and_refuses_other_files() {
        let dir = tempfile::tempdir().unwrap();
        let svg = dir.path().join("a.svg");
        std::fs::write(&svg, "<svg xmlns='http://www.w3.org/2000/svg'/>").unwrap();
        let txt = dir.path().join("secret.txt");
        std::fs::write(&txt, "password").unwrap();
        let cache = ThumbCache::default();
        let uri = |p: &Path, q: &str| -> Uri {
            let enc = percent_encoding::utf8_percent_encode(&p.to_string_lossy(), percent_encoding::NON_ALPHANUMERIC).to_string();
            format!("glint://localhost/{enc}{q}").parse().unwrap()
        };
        let (body, mime) = serve(&cache, &uri(&svg, "")).unwrap();
        assert_eq!(mime, "image/svg+xml");
        assert!(body.starts_with(b"<svg"));
        assert_eq!(serve(&cache, &uri(&txt, "")).unwrap_err().0, StatusCode::UNSUPPORTED_MEDIA_TYPE);
        assert_eq!(serve(&cache, &uri(&dir.path().join("gone.png"), "")).unwrap_err().0, StatusCode::NOT_FOUND);
    }

    #[test]
    fn non_native_formats_arrive_as_png_and_thumbs_are_cached() {
        let dir = tempfile::tempdir().unwrap();
        let qoi = dir.path().join("big.qoi");
        image::RgbaImage::from_pixel(900, 600, image::Rgba([200, 30, 30, 255])).save(&qoi).unwrap();
        let cache = ThumbCache::default();
        let enc = percent_encoding::utf8_percent_encode(&qoi.to_string_lossy(), percent_encoding::NON_ALPHANUMERIC).to_string();
        let (body, mime) = serve(&cache, &format!("glint://localhost/{enc}").parse().unwrap()).unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(formats::sniff(&body), Some(Format::Png));
        let (thumb, mime) = serve(&cache, &format!("glint://localhost/{enc}?thumb").parse().unwrap()).unwrap();
        assert_eq!(mime, "image/jpeg");
        assert_eq!(image::load_from_memory(&thumb).unwrap().width(), THUMB_SIZE);
        assert_eq!(cache.entries.lock().unwrap().len(), 1);
    }
}
