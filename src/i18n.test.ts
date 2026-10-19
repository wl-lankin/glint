// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { detectLanguage, dictionaries, setLanguage, t, translateDom, type Key } from './i18n';
import { formatBytes } from './util';

afterEach(() => setLanguage('en'));

describe('detectLanguage', () => {
  it('picks German for every German system locale', () => {
    for (const locale of ['de', 'de-DE', 'de-AT', 'de-CH', 'DE-de']) expect(detectLanguage('system', [locale])).toBe('de');
  });

  it('falls back to English for everything else', () => {
    for (const locale of ['en-US', 'fr-FR', 'nl', 'dk']) expect(detectLanguage('system', [locale])).toBe('en');
    expect(detectLanguage('system', [])).toBe('en');
  });

  it('lets an explicit choice win over the system', () => {
    expect(detectLanguage('en', ['de-DE'])).toBe('en');
    expect(detectLanguage('de', ['en-US'])).toBe('de');
  });
});

describe('dictionaries', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('German uses the same placeholders as English', () => {
    for (const key of Object.keys(dictionaries.en) as Key[]) {
      expect(placeholders(dictionaries.de[key]), key).toEqual(placeholders(dictionaries.en[key]));
      expect(dictionaries.de[key].trim(), key).not.toBe('');
    }
  });

  it('never uses long dashes', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const text of Object.values(dictionaries[lang])) expect(text).not.toMatch(/[–—]/);
    }
  });
});

describe('t', () => {
  it('fills placeholders in the current language', () => {
    expect(t('sheet.many', { count: 4 })).toBe('4 images');
    setLanguage('de');
    expect(t('sheet.many', { count: 4 })).toBe('4 Bilder');
    expect(document.documentElement.lang).toBe('de');
  });

  it('returns unknown keys unchanged', () => {
    expect(t('exif.Unknown tag' as Key)).toBe('exif.Unknown tag');
  });

  it('formats numbers the German way', () => {
    setLanguage('de');
    expect(formatBytes(1536)).toBe('1,5 KB');
  });
});

describe('translateDom', () => {
  it('translates text, tooltips and labels', () => {
    document.body.innerHTML = '<p data-i18n="start.open"></p><button data-i18n-tip="tip.flip" data-i18n-aria="win.close"></button>';
    setLanguage('de');
    translateDom(document.body);
    expect(document.querySelector('p')!.textContent).toBe('Bilder öffnen');
    const button = document.querySelector('button')!;
    expect(button.dataset.tip).toBe('Spiegeln (F)');
    expect(button.getAttribute('aria-label')).toBe('Schließen');
  });
});
