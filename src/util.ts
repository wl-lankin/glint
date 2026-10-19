import { language, t } from './i18n';

export function baseName(path: string): string {
  // Files dropped in the browser demo are blob URLs that carry their name after '#'.
  if (path.startsWith('blob:') && path.includes('#')) return path.slice(path.lastIndexOf('#') + 1);
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i > 0 ? path.slice(0, i) : '';
}

export function extension(path: string): string {
  const name = baseName(path);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = -1;
  do {
    v /= 1024;
    u++;
  } while (v >= 1024 && u < units.length - 1);
  const digits = v >= 100 ? 0 : 1;
  return `${v.toLocaleString(language(), { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${units[u]}`;
}

export function formatDate(ms: number, locale: string = language()): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
}

export function megapixels(w: number, h: number): string {
  const mp = (w * h) / 1e6;
  const digits = mp >= 10 ? 0 : 1;
  return mp >= 0.1 ? `${mp.toLocaleString(language(), { minimumFractionDigits: digits, maximumFractionDigits: digits })} MP` : '';
}

/** Human label for a sniffed format or, failing that, the extension. */
export function formatLabel(format: string | null | undefined, path: string): string {
  const names: Record<string, string> = {
    png: 'PNG', jpeg: 'JPEG', gif: 'GIF', webp: 'WebP', avif: 'AVIF', heic: 'HEIC', svg: 'SVG', bmp: 'BMP',
    ico: 'ICO', tiff: 'TIFF', tga: 'TGA', qoi: 'QOI', dds: 'DDS', hdr: 'Radiance HDR', exr: 'OpenEXR',
    pnm: 'Netpbm', farbfeld: 'farbfeld', jxl: 'JPEG XL', psd: 'Photoshop',
  };
  return (format && names[format]) || extension(path).toUpperCase() || t('format.image');
}

/** Compares semver-ish tags like "v1.2.0"; positive when `a` is newer. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/i, '').split(/[.-]/).map((p) => parseInt(p, 10) || 0);
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const CANONICAL_EXTENSION: Record<string, string> = {
  png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp', avif: 'avif', heic: 'heic', svg: 'svg', bmp: 'bmp',
  ico: 'ico', tiff: 'tif', tga: 'tga', qoi: 'qoi', dds: 'dds', hdr: 'hdr', exr: 'exr', pnm: 'ppm',
  farbfeld: 'ff', jxl: 'jxl', psd: 'psd',
};

export interface ExtensionMismatch {
  /** Label of the real format, e.g. "PNG". */
  actual: string;
  /** The extension the file has, with dot, or '' when it has none. */
  extension: string;
  /** The extension that fits the content, with dot. */
  suggested: string;
}

/** The file's content is a different image format than its name says (or the name says none). */
export function extensionMismatch(
  info: { content_format: string | null; extension_format: string | null } | null,
  path: string,
): ExtensionMismatch | null {
  if (!info?.content_format || info.content_format === info.extension_format) return null;
  const ext = extension(path);
  return {
    actual: formatLabel(info.content_format, path),
    extension: ext ? `.${ext}` : '',
    suggested: `.${CANONICAL_EXTENSION[info.content_format] ?? info.content_format}`,
  };
}
