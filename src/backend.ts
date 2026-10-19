// Everything Glint asks of the operating system goes through this interface. In the Tauri app it
// is the Rust side; in a plain browser (vite dev without Tauri) a mock with demo images stands in,
// which is how the UI is developed and screenshotted.

export interface FileInfo {
  size: number;
  modified: number | null;
  format: string | null;
  /** Format by the first bytes and by the extension; they differ for a PNG saved as .jpg. */
  content_format: string | null;
  extension_format: string | null;
  exif: [string, string][];
}

export type Platform = 'windows' | 'mac' | 'other';

export interface UpdateState {
  phase: 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'installing' | 'error';
  version?: string;
  progress?: number;
}

export interface Updates {
  readonly state: UpdateState;
  onChange(cb: (state: UpdateState) => void): void;
  check(): Promise<void>;
  /** Installs the downloaded update and restarts Glint. */
  installNow(): Promise<void>;
}

export interface Backend {
  platform: Platform;
  /** The files Glint was opened with (after a multi-file selection has fully arrived). */
  ready(): Promise<string[]>;
  onOpenFiles(cb: (paths: string[]) => void): void;
  onDragDrop(cb: (event: { type: 'over' | 'leave' | 'drop'; paths?: string[] }) => void): void;
  siblings(path: string): Promise<string[]>;
  info(path: string): Promise<FileInfo>;
  url(path: string, thumb?: boolean): string;
  extensions(): Promise<string[]>;
  openDialog(): Promise<string[]>;
  reveal(path: string): Promise<void>;
  copyPng(png: Uint8Array): Promise<void>;
  /** Writes edited SVG source back to its file. */
  saveSvg(path: string, contents: string): Promise<void>;
  /** Makes the next url() of this file bypass the cache (after it changed on disk). */
  invalidate(path: string): void;
  copyText(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  setTitle(title: string): void;
  minimize(): void;
  toggleMaximize(): void;
  onMaximizedChange(cb: (maximized: boolean) => void): void;
  close(): void;
  setFullscreen(on: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
  version(): Promise<string>;
  updates: Updates;
}

/** An updater that never finds anything, for dev builds and the browser mock. */
export function idleUpdates(state: UpdateState = { phase: 'idle' }): Updates {
  return {
    state,
    onChange: (cb) => cb(state),
    check: async () => {},
    installNow: async () => {},
  };
}

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return 'mac';
  if (/Win/i.test(ua)) return 'windows';
  return 'other';
}

export async function loadBackend(): Promise<Backend> {
  if ('__TAURI_INTERNALS__' in window) {
    const { createTauriBackend } = await import('./backend-tauri');
    return createTauriBackend();
  }
  const { createMockBackend } = await import('./backend-mock');
  return createMockBackend();
}
