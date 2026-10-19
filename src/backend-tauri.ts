import { getVersion } from '@tauri-apps/api/app';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { detectPlatform, idleUpdates, type Backend, type FileInfo } from './backend';
import { createUpdater } from './updater';

export function createTauriBackend(): Backend {
  const win = getCurrentWindow();
  // Part of every image URL: a file opened again later is read fresh instead of from the cache.
  const stamp = Date.now().toString(36);
  let extensions: Promise<string[]> | null = null;

  return {
    platform: detectPlatform(),
    ready: () => invoke<string[]>('ready'),
    onOpenFiles(cb) {
      void listen<string[]>('open-files', (e) => cb(e.payload));
    },
    onDragDrop(cb) {
      void getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === 'enter' || p.type === 'over') cb({ type: 'over' });
        else if (p.type === 'leave') cb({ type: 'leave' });
        else if (p.type === 'drop') cb({ type: 'drop', paths: p.paths });
      });
    },
    siblings: (path) => invoke<string[]>('siblings', { path }),
    info: (path) => invoke<FileInfo>('file_info', { path }),
    url: (path, thumb) => `${convertFileSrc(path, 'glint')}?v=${stamp}${thumb ? '&thumb' : ''}`,
    extensions() {
      extensions ??= invoke<string[]>('extensions');
      return extensions;
    },
    async openDialog() {
      const picked = await open({ multiple: true, directory: false, filters: [{ name: 'Images', extensions: await this.extensions() }] });
      if (!picked) return [];
      return Array.isArray(picked) ? picked : [picked];
    },
    reveal: (path) => revealItemInDir(path),
    copyPng: (png) => invoke('copy_image', png),
    copyText: (text) => navigator.clipboard.writeText(text),
    openUrl: (url) => openUrl(url),
    setTitle: (title) => void win.setTitle(title),
    minimize: () => void win.minimize(),
    toggleMaximize: () => void win.toggleMaximize(),
    onMaximizedChange(cb) {
      const check = () => void win.isMaximized().then(cb);
      void win.onResized(check);
      check();
    },
    close: () => void win.close(),
    setFullscreen: (on) => win.setFullscreen(on),
    isFullscreen: () => win.isFullscreen(),
    version: () => getVersion(),
    // Debug builds (tauri dev) are not the installed app; they leave updating alone.
    updates: import.meta.env.DEV ? idleUpdates() : createUpdater(),
  };
}
