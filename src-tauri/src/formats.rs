//! Which images Glint opens, how it recognizes them and how it turns the ones the WebView cannot
//! draw into PNG.

use std::io::Cursor;
use std::path::Path;

use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageFormat, ImageReader, Rgba32FImage, RgbaImage};
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Png,
    Jpeg,
    Gif,
    Webp,
    Avif,
    Heic,
    Svg,
    Bmp,
    Ico,
    Tiff,
    Tga,
    Qoi,
    Dds,
    Hdr,
    Exr,
    Pnm,
    Farbfeld,
    Jxl,
    Psd,
}

use Format::*;

/// Every extension Glint registers for and lists in the open dialog.
pub const EXTENSIONS: &[(&str, Format)] = &[
    ("png", Png),
    ("apng", Png),
    ("jpg", Jpeg),
    ("jpeg", Jpeg),
    ("jpe", Jpeg),
    ("jfif", Jpeg),
    ("pjpeg", Jpeg),
    ("pjp", Jpeg),
    ("gif", Gif),
    ("webp", Webp),
    ("avif", Avif),
    ("heic", Heic),
    ("heif", Heic),
    ("svg", Svg),
    ("bmp", Bmp),
    ("dib", Bmp),
    ("ico", Ico),
    ("cur", Ico),
    ("tif", Tiff),
    ("tiff", Tiff),
    ("tga", Tga),
    ("qoi", Qoi),
    ("dds", Dds),
    ("hdr", Hdr),
    ("exr", Exr),
    ("pbm", Pnm),
    ("pgm", Pnm),
    ("ppm", Pnm),
    ("pnm", Pnm),
    ("pam", Pnm),
    ("ff", Farbfeld),
    ("jxl", Jxl),
    ("psd", Psd),
];

pub fn from_extension(path: &Path) -> Option<Format> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    EXTENSIONS.iter().find(|(e, _)| *e == ext).map(|(_, f)| *f)
}

/// Recognizes an image by its first bytes, so a PNG saved as .jpg still opens.
pub fn sniff(head: &[u8]) -> Option<Format> {
    let starts = |magic: &[u8]| head.starts_with(magic);
    if starts(b"\x89PNG\r\n\x1a\n") {
        return Some(Png);
    }
    if starts(&[0xFF, 0xD8, 0xFF]) {
        return Some(Jpeg);
    }
    if starts(b"GIF87a") || starts(b"GIF89a") {
        return Some(Gif);
    }
    if head.len() >= 12 && &head[0..4] == b"RIFF" && &head[8..12] == b"WEBP" {
        return Some(Webp);
    }
    if head.len() >= 12 && &head[4..8] == b"ftyp" {
        return sniff_ftyp(head);
    }
    if starts(b"8BPS") {
        return Some(Psd);
    }
    if starts(b"II*\0") || starts(b"MM\0*") {
        return Some(Tiff);
    }
    if starts(b"qoif") {
        return Some(Qoi);
    }
    if starts(b"DDS ") {
        return Some(Dds);
    }
    if starts(b"#?RADIANCE") || starts(b"#?RGBE") {
        return Some(Hdr);
    }
    if starts(&[0x76, 0x2F, 0x31, 0x01]) {
        return Some(Exr);
    }
    if starts(b"farbfeld") {
        return Some(Farbfeld);
    }
    if starts(&[0xFF, 0x0A]) || starts(b"\0\0\0\x0cJXL \r\n\x87\n") {
        return Some(Jxl);
    }
    if starts(&[0, 0, 1, 0]) || starts(&[0, 0, 2, 0]) {
        return Some(Ico);
    }
    if starts(b"BM") && head.len() >= 14 {
        return Some(Bmp);
    }
    if head.len() >= 2 && head[0] == b'P' && (b'1'..=b'7').contains(&head[1]) {
        return Some(Pnm);
    }
    if looks_like_svg(head) {
        return Some(Svg);
    }
    None
}

/// ISO base media files: AVIF and HEIC share the container and differ by brand.
fn sniff_ftyp(head: &[u8]) -> Option<Format> {
    let size = u32::from_be_bytes([head[0], head[1], head[2], head[3]]) as usize;
    let end = size.clamp(12, head.len());
    let major = &head[8..12];
    let mut brands = vec![major];
    let mut i = 16;
    while i + 4 <= end {
        brands.push(&head[i..i + 4]);
        i += 4;
    }
    if brands.iter().any(|b| *b == b"avif" || *b == b"avis") {
        return Some(Avif);
    }
    let heic: [&[u8]; 8] = [b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1", b"msf1"];
    if brands.iter().any(|b| heic.contains(b)) {
        return Some(Heic);
    }
    None
}

fn looks_like_svg(head: &[u8]) -> bool {
    let text = String::from_utf8_lossy(&head[..head.len().min(4096)]).to_ascii_lowercase();
    let text = text.trim_start_matches('\u{feff}').trim_start();
    text.starts_with('<') && text.contains("<svg")
}

/// The file's content decides; the extension only helps formats without a magic number (TGA) or
/// an SVG whose `<svg` tag sits behind a long comment.
pub fn detect(path: &Path, head: &[u8]) -> Option<Format> {
    sniff(head).or_else(|| from_extension(path))
}

pub fn mime(format: Format) -> &'static str {
    match format {
        Png => "image/png",
        Jpeg => "image/jpeg",
        Gif => "image/gif",
        Webp => "image/webp",
        Avif => "image/avif",
        Heic => "image/heic",
        Svg => "image/svg+xml",
        Bmp => "image/bmp",
        Ico => "image/x-icon",
        Tiff => "image/tiff",
        Tga => "image/x-tga",
        Qoi => "image/qoi",
        Dds => "image/vnd-ms.dds",
        Hdr => "image/vnd.radiance",
        Exr => "image/x-exr",
        Pnm => "image/x-portable-anymap",
        Farbfeld => "image/x-farbfeld",
        Jxl => "image/jxl",
        Psd => "image/vnd.adobe.photoshop",
    }
}

/// Formats the platform WebView draws itself (Chromium on Windows, WebKit on macOS).
pub fn webview_native(format: Format) -> bool {
    match format {
        Png | Jpeg | Gif | Webp | Avif | Svg | Bmp | Ico => true,
        Tiff | Heic => cfg!(target_os = "macos"),
        _ => false,
    }
}

/// Formats Glint decodes itself in Rust.
pub fn rust_decodable(format: Format) -> bool {
    !matches!(format, Svg | Avif | Heic)
}

pub fn decode(bytes: &[u8], format: Format) -> Result<DynamicImage, String> {
    let image = match format {
        Psd => {
            let psd = psd::Psd::from_bytes(bytes).map_err(|e| format!("PSD: {e}"))?;
            let rgba = RgbaImage::from_raw(psd.width(), psd.height(), psd.rgba()).ok_or("PSD: bad size")?;
            DynamicImage::ImageRgba8(rgba)
        }
        Jxl => {
            let decoder = jxl_oxide::integration::JxlDecoder::new(Cursor::new(bytes)).map_err(|e| format!("JPEG XL: {e}"))?;
            DynamicImage::from_decoder(decoder).map_err(|e| format!("JPEG XL: {e}"))?
        }
        Svg | Avif | Heic => return Err(format!("{format:?} is drawn by the WebView, not decoded")),
        _ => {
            let image_format = image_format(format).ok_or("unsupported format")?;
            let mut reader = ImageReader::new(Cursor::new(bytes));
            reader.set_format(image_format);
            reader.no_limits();
            let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
            let orientation = decoder.orientation().ok();
            let mut image = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
            if let Some(o) = orientation {
                image.apply_orientation(o);
            }
            image
        }
    };
    Ok(match format {
        Hdr | Exr => tone_map(image),
        _ => image,
    })
}

fn image_format(format: Format) -> Option<ImageFormat> {
    Some(match format {
        Png => ImageFormat::Png,
        Jpeg => ImageFormat::Jpeg,
        Gif => ImageFormat::Gif,
        Webp => ImageFormat::WebP,
        Bmp => ImageFormat::Bmp,
        Ico => ImageFormat::Ico,
        Tiff => ImageFormat::Tiff,
        Tga => ImageFormat::Tga,
        Qoi => ImageFormat::Qoi,
        Dds => ImageFormat::Dds,
        Hdr => ImageFormat::Hdr,
        Exr => ImageFormat::OpenExr,
        Pnm => ImageFormat::Pnm,
        Farbfeld => ImageFormat::Farbfeld,
        _ => return None,
    })
}

/// HDR and EXR hold linear light above 1.0: Reinhard tone mapping and the sRGB curve make them
/// look like a photo instead of a blown-out clamp.
fn tone_map(image: DynamicImage) -> DynamicImage {
    let linear: Rgba32FImage = image.to_rgba32f();
    let mut out = RgbaImage::new(linear.width(), linear.height());
    for (src, dst) in linear.pixels().zip(out.pixels_mut()) {
        for c in 0..3 {
            let v = src[c].max(0.0);
            let mapped = v / (1.0 + v);
            let srgb = if mapped <= 0.003_130_8 { mapped * 12.92 } else { 1.055 * mapped.powf(1.0 / 2.4) - 0.055 };
            dst[c] = (srgb * 255.0).round().clamp(0.0, 255.0) as u8;
        }
        dst[3] = (src[3].clamp(0.0, 1.0) * 255.0).round() as u8;
    }
    DynamicImage::ImageRgba8(out)
}

pub fn encode_png(image: &DynamicImage) -> Result<Vec<u8>, String> {
    let rgba = image.to_rgba8();
    let mut out = Vec::with_capacity(rgba.len() / 2);
    PngEncoder::new_with_quality(&mut out, CompressionType::Fast, FilterType::Adaptive)
        .write_image(&rgba, rgba.width(), rgba.height(), image::ExtendedColorType::Rgba8)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

/// A small preview for the filmstrip, the contact sheet and the ambient glow: JPEG when the image
/// is opaque, PNG when it has transparency.
pub fn thumbnail(bytes: &[u8], format: Format, max: u32) -> Result<(Vec<u8>, &'static str), String> {
    let image = decode(bytes, format)?;
    let thumb = image.thumbnail(max, max);
    if thumb.color().has_alpha() && thumb.to_rgba8().pixels().any(|p| p[3] < 255) {
        return Ok((encode_png(&thumb)?, "image/png"));
    }
    let rgb = thumb.to_rgb8();
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, 82)
        .write_image(&rgb, rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        .map_err(|e| e.to_string())?;
    Ok((out, "image/jpeg"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn encoded(format: ImageFormat, image: &DynamicImage) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        image.write_to(&mut out, format).unwrap();
        out.into_inner()
    }

    fn sample() -> DynamicImage {
        DynamicImage::ImageRgba8(RgbaImage::from_fn(40, 30, |x, y| image::Rgba([(x * 6) as u8, (y * 8) as u8, 128, 255])))
    }

    #[test]
    fn sniffs_formats_by_magic_bytes() {
        let img = sample();
        assert_eq!(sniff(&encoded(ImageFormat::Png, &img)), Some(Png));
        assert_eq!(sniff(&encoded(ImageFormat::Jpeg, &DynamicImage::ImageRgb8(img.to_rgb8()))), Some(Jpeg));
        assert_eq!(sniff(&encoded(ImageFormat::Gif, &img)), Some(Gif));
        assert_eq!(sniff(&encoded(ImageFormat::Bmp, &img)), Some(Bmp));
        assert_eq!(sniff(&encoded(ImageFormat::Tiff, &img)), Some(Tiff));
        assert_eq!(sniff(&encoded(ImageFormat::Qoi, &img)), Some(Qoi));
        assert_eq!(sniff(b"8BPS\0\x01"), Some(Psd));
        assert_eq!(sniff(&[0xFF, 0x0A, 0x00]), Some(Jxl));
        assert_eq!(sniff(b"P6\n40 30\n255\n"), Some(Pnm));
        assert_eq!(sniff(b"RIFF\0\0\0\0WEBPVP8 "), Some(Webp));
    }

    #[test]
    fn tells_avif_from_heic() {
        assert_eq!(sniff(b"\0\0\0\x1cftypavif\0\0\0\0avifmif1miaf"), Some(Avif));
        assert_eq!(sniff(b"\0\0\0\x1cftypmif1\0\0\0\0mif1avifmiaf"), Some(Avif));
        assert_eq!(sniff(b"\0\0\0\x18ftypheic\0\0\0\0mif1heic"), Some(Heic));
        assert_eq!(sniff(b"\0\0\0\x14ftypisom\0\0\0\0isom"), None);
    }

    #[test]
    fn sniffs_svg_with_prolog_and_bom() {
        assert_eq!(sniff(b"<svg xmlns='http://www.w3.org/2000/svg'/>"), Some(Svg));
        assert_eq!(sniff("\u{feff}<?xml version=\"1.0\"?>\n<!-- x -->\n<SVG>".as_bytes()), Some(Svg));
        assert_eq!(sniff(b"<html><body>no</body></html>"), None);
        assert_eq!(sniff(b"plain text"), None);
    }

    #[test]
    fn content_wins_over_extension() {
        let png = encoded(ImageFormat::Png, &sample());
        assert_eq!(detect(&PathBuf::from("photo.jpg"), &png), Some(Png));
        assert_eq!(detect(&PathBuf::from("sprite.TGA"), &[0, 0, 2, 0][..2]), Some(Tga));
        assert_eq!(detect(&PathBuf::from("notes.txt"), b"hello"), None);
    }

    #[test]
    fn extension_lookup_ignores_case() {
        assert_eq!(from_extension(Path::new("a/B.JPEG")), Some(Jpeg));
        assert_eq!(from_extension(Path::new("x.Svg")), Some(Svg));
        assert_eq!(from_extension(Path::new("x.txt")), None);
        assert_eq!(from_extension(Path::new("noext")), None);
    }

    #[test]
    fn decodes_rust_formats_to_png() {
        let img = sample();
        for format in [ImageFormat::Tiff, ImageFormat::Tga, ImageFormat::Qoi, ImageFormat::Pnm, ImageFormat::Farbfeld, ImageFormat::OpenExr] {
            let source = match format {
                ImageFormat::Pnm => DynamicImage::ImageRgb8(img.to_rgb8()),
                ImageFormat::OpenExr => DynamicImage::ImageRgba32F(img.to_rgba32f()),
                ImageFormat::Farbfeld => DynamicImage::ImageRgba16(img.to_rgba16()),
                _ => img.clone(),
            };
            let bytes = encoded(format, &source);
            let ours = detect(Path::new(&format!("x.{}", format.extensions_str()[0])), &bytes).unwrap();
            let decoded = decode(&bytes, ours).unwrap_or_else(|e| panic!("{format:?}: {e}"));
            assert_eq!((decoded.width(), decoded.height()), (40, 30), "{format:?}");
            let png = encode_png(&decoded).unwrap();
            assert_eq!(sniff(&png), Some(Png));
        }
    }

    #[test]
    fn tone_maps_hdr_values() {
        let bright = DynamicImage::ImageRgba32F(Rgba32FImage::from_pixel(2, 2, image::Rgba([8.0, 1.0, 0.0, 1.0])));
        let mapped = tone_map(bright).to_rgba8();
        let p = mapped.get_pixel(0, 0);
        assert!(p[0] > 240 && p[0] < 255, "8.0 maps near white, not clipped: {}", p[0]);
        assert!(p[1] > 150 && p[1] < 200, "1.0 maps to mid-bright: {}", p[1]);
        assert_eq!(p[2], 0);
    }

    #[test]
    fn thumbnails_keep_aspect_and_alpha() {
        let opaque = DynamicImage::ImageRgb8(image::RgbImage::from_pixel(800, 400, image::Rgb([10, 20, 30])));
        let bytes = encoded(ImageFormat::Png, &opaque);
        let (thumb, mime) = thumbnail(&bytes, Png, 200).unwrap();
        assert_eq!(mime, "image/jpeg");
        let t = image::load_from_memory(&thumb).unwrap();
        assert_eq!((t.width(), t.height()), (200, 100));

        let clear = DynamicImage::ImageRgba8(RgbaImage::from_pixel(50, 50, image::Rgba([0, 0, 0, 0])));
        let (_, mime) = thumbnail(&encoded(ImageFormat::Png, &clear), Png, 20).unwrap();
        assert_eq!(mime, "image/png");
    }

    #[test]
    fn webview_formats_are_not_decoded_in_rust() {
        assert!(decode(b"<svg/>", Svg).is_err());
        assert!(!rust_decodable(Avif));
        assert!(webview_native(Png) && webview_native(Svg));
        assert!(!webview_native(Psd) && !webview_native(Jxl));
    }
}
