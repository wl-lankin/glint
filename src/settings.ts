import type { LanguagePreference } from './i18n';

export interface Settings {
  /** 'system' follows the system language (German or English). */
  language: LanguagePreference;
  theme: 'dark' | 'light' | 'system';
  ambient: boolean;
  /** What shows through transparent pixels. 'auto' lets the ambient glow through. */
  backdrop: 'auto' | 'checker' | 'black' | 'white';
  /** Seconds per image in a slideshow. */
  interval: number;
  transition: 'fade' | 'kenburns' | 'none';
  /** Start the slideshow by itself when several files are opened together. */
  autoplay: boolean;
}

export const DEFAULTS: Settings = {
  language: 'system',
  theme: 'dark',
  ambient: true,
  backdrop: 'auto',
  interval: 5,
  transition: 'kenburns',
  autoplay: true,
};

const KEY = 'glint.settings';

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return sanitize({ ...DEFAULTS, ...stored });
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable; the settings then last for this session.
  }
}

export function sanitize(s: Settings): Settings {
  const pick = <T>(v: T, allowed: readonly T[], fallback: T) => (allowed.includes(v) ? v : fallback);
  return {
    language: pick(s.language, ['system', 'en', 'de'] as const, DEFAULTS.language),
    theme: pick(s.theme, ['dark', 'light', 'system'] as const, DEFAULTS.theme),
    ambient: typeof s.ambient === 'boolean' ? s.ambient : DEFAULTS.ambient,
    backdrop: pick(s.backdrop, ['auto', 'checker', 'black', 'white'] as const, DEFAULTS.backdrop),
    interval: Number.isFinite(s.interval) ? Math.min(30, Math.max(2, Math.round(s.interval))) : DEFAULTS.interval,
    transition: pick(s.transition, ['fade', 'kenburns', 'none'] as const, DEFAULTS.transition),
    autoplay: typeof s.autoplay === 'boolean' ? s.autoplay : DEFAULTS.autoplay,
  };
}
