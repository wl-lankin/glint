import { language, t } from './i18n';

export function baseName(path: string): string {
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
