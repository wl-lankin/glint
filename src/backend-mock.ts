// Browser stand-in for the Tauri side, used by `npm run dev` without Tauri.
// ?demo=show opens the demo images as a slideshow, ?demo=single opens one image, nothing opens
// the empty start screen.
import { detectPlatform, idleUpdates, type Backend, type FileInfo } from './backend';

const DEMO = ['atom.svg', 'aurora.jpg', 'canyon.jpg', 'coast.jpg', 'forest.jpg', 'city.jpg', 'peaks.jpg', 'glint.svg', 'alpha.png', 'mislabeled.jpg'];
const demoPath = (name: string) => `/demo/${name}`;

export function createMockBackend(): Backend {
  const params = new URLSearchParams(location.search);
  const demo = params.get('demo');
  const platform = (params.get('platform') as Backend['platform']) || detectPlatform();
  const dropListeners: ((e: { type: 'over' | 'leave' | 'drop'; paths?: string[] }) => void)[] = [];

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropListeners.forEach((l) => l({ type: 'over' }));
  });
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) dropListeners.forEach((l) => l({ type: 'leave' }));
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const paths = [...(e.dataTransfer?.files ?? [])].map((f) => URL.createObjectURL(f) + '#' + f.name);
    dropListeners.forEach((l) => l({ type: 'drop', paths }));
  });

  return {
    platform,
    async ready() {
      if (demo === 'show') return DEMO.slice(0, 6).map(demoPath);
      if (demo === 'single') return [demoPath(params.get('file') ?? 'aurora.jpg')];
      return [];
    },
    onOpenFiles() {},
    onDragDrop(cb) {
      dropListeners.push(cb);
    },
    async siblings(path) {
      return path.startsWith('/demo/') ? DEMO.map(demoPath) : [path];
    },
    async info(path): Promise<FileInfo> {
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      const format = ext === 'jpg' ? 'jpeg' : ext;
      const exif: [string, string][] =
        format === 'jpeg'
          ? [['Camera', 'FUJIFILM X-T5'], ['Lens', 'XF23mmF1.4 R LM WR'], ['Aperture', 'f/2.8'], ['Exposure', '1/250 s'], ['ISO', '160'], ['Focal length', '23 mm'], ['Taken', '2026-09-14 18:42:07']]
          : [];
      const size = (await fetch(path.split('#')[0]).then((r) => r.blob()).catch(() => null))?.size ?? 0;
      // demo/mislabeled.jpg is a PNG with the wrong extension.
      const content = path.includes('mislabeled') ? 'png' : format;
      return { size, modified: Date.now() - 86_400_000 * 3, format: content, content_format: content, extension_format: format, exif };
    },
    url: (path) => path,
    async extensions() {
      return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico'];
    },
    async openDialog() {
      return DEMO.map(demoPath);
    },
    async reveal(path) {
      console.info('reveal', path);
    },
    async copyPng(png) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([png as BlobPart], { type: 'image/png' }) })]);
    },
    async saveSvg(path, contents) {
      console.info('save', path, contents.length);
    },
    invalidate() {},
    copyText: (text) => navigator.clipboard.writeText(text),
    async openUrl(url) {
      window.open(url, '_blank', 'noopener');
    },
    setTitle(title) {
      document.title = title;
    },
    minimize() {},
    toggleMaximize() {},
    onMaximizedChange() {},
    close() {},
    async setFullscreen(on) {
      if (on) await document.documentElement.requestFullscreen().catch(() => {});
      else if (document.fullscreenElement) await document.exitFullscreen();
    },
    async isFullscreen() {
      return !!document.fullscreenElement;
    },
    async version() {
      return '1.0.0';
    },
    // ?update=ready shows the update pill.
    updates: idleUpdates(params.get('update') === 'ready' ? { phase: 'ready', version: '1.1.0' } : { phase: 'current' }),
  };
}
