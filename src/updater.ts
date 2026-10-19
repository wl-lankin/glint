// Keeps Glint current: checks GitHub Releases a few seconds after start and then every few hours,
// downloads a new version in the background (signed with Glint's updater key, verified by the
// plugin) and installs it when the window closes, or at once on "Restart to update".
import { exit, relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UpdateState, Updates } from './backend';

const FIRST_CHECK_MS = 4_000;
const RECHECK_MS = 6 * 60 * 60 * 1000;

export function createUpdater(): Updates {
  let state: UpdateState = { phase: 'idle' };
  let pending: Update | null = null;
  let installing = false;
  const listeners = new Set<(s: UpdateState) => void>();
  const set = (next: UpdateState) => {
    state = next;
    listeners.forEach((l) => l(state));
  };

  async function run() {
    if (pending || state.phase === 'checking' || state.phase === 'downloading') return;
    set({ phase: 'checking' });
    try {
      const update = await check();
      if (!update) return set({ phase: 'current' });
      let total = 0;
      let received = 0;
      set({ phase: 'downloading', version: update.version, progress: 0 });
      await update.download((e) => {
        if (e.event === 'Started') total = e.data.contentLength ?? 0;
        else if (e.event === 'Progress') {
          received += e.data.chunkLength;
          set({ phase: 'downloading', version: update.version, progress: total ? received / total : 0 });
        }
      });
      pending = update;
      set({ phase: 'ready', version: update.version });
    } catch (error) {
      console.warn('update check failed', error);
      set({ phase: 'error' });
    }
  }

  async function install(restart: boolean) {
    if (!pending || installing) return;
    installing = true;
    set({ phase: 'installing', version: pending.version });
    try {
      // On Windows this starts the installer, which closes Glint and, after a restart request, opens it again.
      await pending.install();
      if (restart) await relaunch();
      else await exit(0);
    } catch (error) {
      console.warn('update install failed', error);
      installing = false;
      set({ phase: 'error' });
    }
  }

  // A downloaded update goes in when Glint is closed.
  void getCurrentWindow().onCloseRequested(async (event) => {
    if (!pending) return;
    event.preventDefault();
    await install(false);
    if (!installing) await getCurrentWindow().destroy();
  });

  setTimeout(() => void run(), FIRST_CHECK_MS);
  setInterval(() => void run(), RECHECK_MS);

  return {
    get state() {
      return state;
    },
    onChange(cb) {
      listeners.add(cb);
      cb(state);
    },
    check: run,
    installNow: () => install(true),
  };
}
