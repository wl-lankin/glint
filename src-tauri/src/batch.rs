//! Gathers files that arrive close together into one set.
//!
//! Explorer starts one Glint process per selected file. The first one keeps running; every other
//! one hands its path over (single-instance plugin) and exits. Paths that arrive within
//! `SETTLE` of each other belong to one selection: more than one opens as a slideshow. macOS
//! delivers a whole Finder selection in one `Opened` event, which takes the same path.

use std::collections::HashSet;
use std::mem;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::formats;

pub const SETTLE: Duration = Duration::from_millis(250);

#[derive(Default)]
pub struct Batch {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    pending: Vec<PathBuf>,
    generation: u64,
    last_add: Option<Instant>,
    /// Set once the frontend took its first set; from then on sets arrive as events.
    ready: bool,
}

impl Batch {
    /// Queues files and returns the generation a flush must still match to send them.
    pub fn push(&self, files: Vec<PathBuf>, now: Instant) -> Option<u64> {
        if files.is_empty() {
            return None;
        }
        let mut inner = self.inner.lock().unwrap();
        inner.pending.extend(files);
        inner.generation += 1;
        inner.last_add = Some(now);
        Some(inner.generation)
    }

    /// The pending set when nothing new arrived since `generation` and the frontend is listening.
    pub fn take_if_settled(&self, generation: u64) -> Option<Vec<PathBuf>> {
        let mut inner = self.inner.lock().unwrap();
        if !inner.ready || inner.generation != generation || inner.pending.is_empty() {
            return None;
        }
        Some(dedupe(mem::take(&mut inner.pending)))
    }

    /// The frontend's first call: either how long to wait for the selection to settle, or the set.
    pub fn first_set(&self, now: Instant) -> Result<Vec<PathBuf>, Duration> {
        let mut inner = self.inner.lock().unwrap();
        if let Some(last) = inner.last_add {
            let since = now.saturating_duration_since(last);
            if since < SETTLE {
                return Err(SETTLE - since);
            }
        }
        inner.ready = true;
        Ok(dedupe(mem::take(&mut inner.pending)))
    }

    pub fn add<R: Runtime>(&self, app: &AppHandle<R>, files: Vec<PathBuf>) {
        let Some(generation) = self.push(files, Instant::now()) else { return };
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(SETTLE);
            if let Some(files) = app.state::<Batch>().take_if_settled(generation) {
                let paths: Vec<String> = files.iter().map(|p| p.to_string_lossy().into_owned()).collect();
                let _ = app.emit("open-files", paths);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        });
    }
}

fn dedupe(files: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    files.into_iter().filter(|f| seen.insert(f.clone())).collect()
}

/// Image files named on a command line, resolved against the caller's working directory.
pub fn files_from_args(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<PathBuf> {
    args.into_iter()
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(a);
            if p.is_absolute() {
                p
            } else {
                cwd.join(p)
            }
        })
        .filter(|p| p.is_file() && is_image(p))
        .collect()
}

pub fn is_image(path: &Path) -> bool {
    if formats::from_extension(path).is_some() {
        return true;
    }
    let mut head = [0u8; 512];
    let Ok(mut file) = std::fs::File::open(path) else { return false };
    let n = std::io::Read::read(&mut file, &mut head).unwrap_or(0);
    formats::sniff(&head[..n]).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> PathBuf {
        PathBuf::from(s)
    }

    #[test]
    fn waits_until_the_selection_settles() {
        let batch = Batch::default();
        let t0 = Instant::now();
        batch.push(vec![p("a.png")], t0);
        let wait = batch.first_set(t0 + Duration::from_millis(100)).unwrap_err();
        assert_eq!(wait, Duration::from_millis(150));
        batch.push(vec![p("b.png")], t0 + Duration::from_millis(120));
        assert!(batch.first_set(t0 + Duration::from_millis(300)).is_err());
        let set = batch.first_set(t0 + Duration::from_millis(400)).unwrap();
        assert_eq!(set, vec![p("a.png"), p("b.png")]);
    }

    #[test]
    fn an_empty_start_is_ready_at_once() {
        let batch = Batch::default();
        assert_eq!(batch.first_set(Instant::now()).unwrap(), Vec::<PathBuf>::new());
    }

    #[test]
    fn only_the_last_timer_flushes() {
        let batch = Batch::default();
        batch.first_set(Instant::now()).unwrap();
        let now = Instant::now();
        let g1 = batch.push(vec![p("a.png")], now).unwrap();
        let g2 = batch.push(vec![p("b.png"), p("a.png")], now).unwrap();
        assert_eq!(batch.take_if_settled(g1), None);
        assert_eq!(batch.take_if_settled(g2), Some(vec![p("a.png"), p("b.png")]));
        assert_eq!(batch.take_if_settled(g2), None);
    }

    #[test]
    fn nothing_is_sent_before_the_frontend_is_ready() {
        let batch = Batch::default();
        let g = batch.push(vec![p("a.png")], Instant::now()).unwrap();
        assert_eq!(batch.take_if_settled(g), None);
        assert!(batch.push(vec![], Instant::now()).is_none());
    }

    #[test]
    fn args_keep_existing_images_only() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.png"), b"x").unwrap();
        std::fs::write(dir.path().join("notes.txt"), b"hello").unwrap();
        std::fs::write(dir.path().join("mystery"), b"\x89PNG\r\n\x1a\nrest").unwrap();
        let args = ["a.png", "notes.txt", "missing.png", "--flag", "mystery"].map(String::from);
        let files = files_from_args(args, dir.path());
        assert_eq!(files, vec![dir.path().join("a.png"), dir.path().join("mystery")]);
    }
}
