use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{Instant, UNIX_EPOCH};

use exif::{In, Tag, Value};
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

use crate::batch::Batch;
use crate::formats::{self, Format};

/// The files Glint was opened with. Waits until a multi-file selection has fully arrived.
#[tauri::command(async)]
pub fn ready(batch: State<'_, Batch>) -> Vec<String> {
    loop {
        match batch.first_set(Instant::now()) {
            Ok(files) => return files.iter().map(|p| p.to_string_lossy().into_owned()).collect(),
            Err(wait) => std::thread::sleep(wait),
        }
    }
}

#[tauri::command]
pub fn extensions() -> Vec<&'static str> {
    formats::EXTENSIONS.iter().map(|(e, _)| *e).collect()
}

/// The images in the folder of `path`, in natural order (img2 before img10), `path` included.
#[tauri::command(async)]
pub fn siblings(path: String) -> Vec<String> {
    let path = PathBuf::from(path);
    let mut files = list_siblings(&path);
    if !files.contains(&path) {
        files.push(path);
        sort_naturally(&mut files);
    }
    files.iter().map(|p| p.to_string_lossy().into_owned()).collect()
}

pub fn list_siblings(path: &Path) -> Vec<PathBuf> {
    let Some(dir) = path.parent() else { return vec![] };
    let Ok(entries) = std::fs::read_dir(dir) else { return vec![] };
    let mut files: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.path())
        .filter(|p| formats::from_extension(p).is_some())
        .collect();
    sort_naturally(&mut files);
    files
}

fn sort_naturally(files: &mut [PathBuf]) {
    files.sort_by(|a, b| {
        let name = |p: &PathBuf| p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        natord::compare_ignore_case(&name(a), &name(b))
    });
}

#[derive(Serialize)]
pub struct FileInfo {
    size: u64,
    modified: Option<u64>,
    format: Option<Format>,
    exif: Vec<(String, String)>,
}

#[tauri::command(async)]
pub fn file_info(path: String) -> Result<FileInfo, String> {
    let path = PathBuf::from(path);
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64);
    let mut head = vec![0u8; 4096];
    let n = File::open(&path).and_then(|mut f| f.read(&mut head)).unwrap_or(0);
    head.truncate(n);
    Ok(FileInfo { size: meta.len(), modified, format: formats::detect(&path, &head), exif: read_exif(&path) })
}

fn read_exif(path: &Path) -> Vec<(String, String)> {
    let Ok(file) = File::open(path) else { return vec![] };
    let Ok(exif) = exif::Reader::new().read_from_container(&mut BufReader::new(file)) else { return vec![] };
    let text = |tag: Tag| -> Option<String> {
        let field = exif.get_field(tag, In::PRIMARY)?;
        let value = field.display_value().with_unit(&exif).to_string();
        let value = value.trim().trim_matches('"').trim().to_string();
        (!value.is_empty()).then_some(value)
    };
    let mut out = Vec::new();
    let camera = match (text(Tag::Make), text(Tag::Model)) {
        (Some(make), Some(model)) if model.starts_with(&make) => Some(model),
        (Some(make), Some(model)) => Some(format!("{make} {model}")),
        (make, model) => make.or(model),
    };
    let rows = [
        ("Camera", camera),
        ("Lens", text(Tag::LensModel)),
        ("Aperture", text(Tag::FNumber)),
        ("Exposure", text(Tag::ExposureTime)),
        ("ISO", text(Tag::PhotographicSensitivity)),
        ("Focal length", text(Tag::FocalLength)),
        ("Taken", text(Tag::DateTimeOriginal)),
        ("Software", text(Tag::Software)),
        ("Artist", text(Tag::Artist)),
        ("Copyright", text(Tag::Copyright)),
        ("Location", gps(&exif)),
    ];
    for (label, value) in rows {
        if let Some(value) = value {
            out.push((label.to_string(), value));
        }
    }
    out
}

fn gps(exif: &exif::Exif) -> Option<String> {
    let coordinate = |tag: Tag, reference: Tag, negative: &str| -> Option<f64> {
        let Value::Rational(ref parts) = exif.get_field(tag, In::PRIMARY)?.value else { return None };
        let [d, m, s] = parts.as_slice() else { return None };
        let mut value = d.to_f64() + m.to_f64() / 60.0 + s.to_f64() / 3600.0;
        let r = exif.get_field(reference, In::PRIMARY)?.display_value().to_string();
        if r.contains(negative) {
            value = -value;
        }
        value.is_finite().then_some(value)
    };
    let lat = coordinate(Tag::GPSLatitude, Tag::GPSLatitudeRef, "S")?;
    let lon = coordinate(Tag::GPSLongitude, Tag::GPSLongitudeRef, "W")?;
    Some(format!("{lat:.5}, {lon:.5}"))
}

/// Puts the PNG the frontend rendered from the current view on the clipboard.
#[tauri::command]
pub fn copy_image(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(png) = request.body() else { return Err("expected PNG bytes".into()) };
    let rgba = image::load_from_memory(png).map_err(|e| e.to_string())?.to_rgba8();
    let data = arboard::ImageData { width: rgba.width() as usize, height: rgba.height() as usize, bytes: rgba.into_raw().into() };
    arboard::Clipboard::new().and_then(|mut c| c.set_image(data)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn siblings_are_images_in_natural_order() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["img10.png", "img2.JPG", "Img1.svg", "readme.txt", "z.psd"] {
            std::fs::write(dir.path().join(name), b"x").unwrap();
        }
        std::fs::create_dir(dir.path().join("folder.png")).unwrap();
        let names: Vec<String> = siblings(dir.path().join("img2.JPG").to_string_lossy().into_owned())
            .iter()
            .map(|p| Path::new(p).file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["Img1.svg", "img2.JPG", "img10.png", "z.psd"]);
    }

    #[test]
    fn a_sniffed_file_without_image_extension_joins_its_siblings() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("b.png"), b"x").unwrap();
        let odd = dir.path().join("a.download");
        std::fs::write(&odd, b"\x89PNG\r\n\x1a\n").unwrap();
        let list = siblings(odd.to_string_lossy().into_owned());
        assert_eq!(list.len(), 2);
        assert_eq!(PathBuf::from(&list[0]), odd);
    }

    #[test]
    fn file_info_reports_size_and_format() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("x.svg");
        std::fs::write(&file, "<svg xmlns='http://www.w3.org/2000/svg'/>").unwrap();
        let info = file_info(file.to_string_lossy().into_owned()).unwrap();
        assert_eq!(info.size, 41);
        assert_eq!(info.format, Some(Format::Svg));
        assert!(info.modified.is_some());
        assert!(info.exif.is_empty());
    }
}
