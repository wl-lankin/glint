import { describe, expect, it, vi } from 'vitest';
import { backdropNeed, extractPalette, inkFor, toHex } from './palette';
import { sanitize, DEFAULTS } from './settings';
import { Slideshow } from './slideshow';
import { baseName, compareVersions, dirName, extension, extensionMismatch, formatBytes, formatLabel } from './util';

describe('Slideshow', () => {
  it('advances once per interval and waits for the next image', () => {
    const advance = vi.fn();
    const show = new Slideshow(1000, advance, () => {});
    show.tick(500);
    expect(advance).not.toHaveBeenCalled();
    show.play();
    for (let i = 0; i < 6; i++) show.tick(200);
    expect(advance).toHaveBeenCalledTimes(1);
    // Held until the next image is on screen.
    show.tick(5000);
    expect(advance).toHaveBeenCalledTimes(1);
    show.restart();
    show.tick(200);
    expect(show.progress()).toBeCloseTo(0.2);
  });

  it('caps a long frame so a sleeping laptop does not skip images', () => {
    const advance = vi.fn();
    const show = new Slideshow(1000, advance, () => {});
    show.play();
    show.tick(60_000);
    expect(advance).not.toHaveBeenCalled();
    expect(show.progress()).toBeCloseTo(0.25);
  });

  it('reports play state changes', () => {
    const changes: boolean[] = [];
    const show = new Slideshow(1000, () => {}, (p) => changes.push(p));
    show.toggle();
    show.toggle();
    expect(changes).toEqual([true, false]);
  });
});

describe('extractPalette', () => {
  const pixels = (colors: [number, number, number, number][], counts: number[]) => {
    const out: number[] = [];
    colors.forEach((c, i) => {
      for (let n = 0; n < counts[i]; n++) out.push(...c);
    });
    return new Uint8ClampedArray(out);
  };

  it('finds the dominant colors ordered by share', () => {
    const data = pixels([[250, 20, 20, 255], [20, 20, 250, 255], [20, 240, 20, 255]], [60, 30, 10]);
    const p = extractPalette(data, 3);
    expect(p.map((s) => toHex(s.r, s.g, s.b))).toEqual(['#FA1414', '#1414FA', '#14F014']);
    expect(p[0].share).toBeCloseTo(0.6);
  });

  it('ignores transparent pixels and merges a flat image into one swatch', () => {
    const data = pixels([[10, 10, 10, 255], [255, 255, 255, 0]], [20, 80]);
    const p = extractPalette(data, 6);
    expect(p).toHaveLength(1);
    expect(p[0].share).toBe(1);
    expect(extractPalette(pixels([[1, 2, 3, 0]], [5]))).toEqual([]);
  });

  it('is deterministic', () => {
    const data = new Uint8ClampedArray(4 * 500).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));
    expect(extractPalette(data)).toEqual(extractPalette(data));
  });

  it('picks readable ink', () => {
    expect(inkFor(255, 255, 255)).toBe('#000');
    expect(inkFor(20, 20, 40)).toBe('#fff');
  });
});

describe('settings', () => {
  it('repairs stored values', () => {
    const s = sanitize({ ...DEFAULTS, interval: 999, theme: 'neon' as never, backdrop: 'checker' });
    expect(s.interval).toBe(30);
    expect(s.theme).toBe('dark');
    expect(s.backdrop).toBe('checker');
  });
});

describe('util', () => {
  it('splits Windows and POSIX paths', () => {
    expect(baseName('C:\\Users\\me\\a.b.PNG')).toBe('a.b.PNG');
    expect(dirName('C:\\Users\\me\\a.png')).toBe('C:\\Users\\me');
    expect(baseName('/Users/me/photo.jpg')).toBe('photo.jpg');
    expect(extension('/x/Photo.JPEG')).toBe('jpeg');
    expect(extension('/x/.hidden')).toBe('');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(300 * 1024 * 1024)).toBe('300 MB');
  });

  it('labels formats', () => {
    expect(formatLabel('jxl', 'a.jxl')).toBe('JPEG XL');
    expect(formatLabel(null, 'a.webp')).toBe('WEBP');
  });

  it('compares versions', () => {
    expect(compareVersions('v1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });
});

describe('backdropNeed', () => {
  const image = (fill: [number, number, number, number], background: [number, number, number, number], share: number) => {
    const out: number[] = [];
    for (let i = 0; i < 100; i++) out.push(...(i < share * 100 ? fill : background));
    return new Uint8ClampedArray(out);
  };

  it('asks for a light card behind dark content on transparency', () => {
    expect(backdropNeed(image([0, 0, 0, 255], [0, 0, 0, 0], 0.3))).toBe('light');
    expect(backdropNeed(image([30, 32, 40, 255], [0, 0, 0, 0], 0.5))).toBe('light');
  });

  it('asks for a dark card behind white content', () => {
    expect(backdropNeed(image([255, 255, 255, 255], [0, 0, 0, 0], 0.4))).toBe('dark');
  });

  it('leaves colorful and opaque images alone', () => {
    expect(backdropNeed(image([255, 106, 166, 255], [0, 0, 0, 0], 0.4))).toBeNull();
    expect(backdropNeed(image([0, 0, 0, 255], [0, 0, 0, 255], 1))).toBeNull();
    expect(backdropNeed(new Uint8ClampedArray(400))).toBeNull();
  });
});

describe('extensionMismatch', () => {
  const info = (content: string | null, ext: string | null) => ({ content_format: content, extension_format: ext });

  it('spots a PNG saved as .jpg', () => {
    expect(extensionMismatch(info('png', 'jpeg'), '/x/photo.JPG')).toEqual({ actual: 'PNG', extension: '.jpg', suggested: '.png' });
  });

  it('spots an image without an image extension', () => {
    expect(extensionMismatch(info('jpeg', null), '/x/photo.download')).toEqual({ actual: 'JPEG', extension: '.download', suggested: '.jpg' });
    expect(extensionMismatch(info('webp', null), '/x/photo')).toEqual({ actual: 'WebP', extension: '', suggested: '.webp' });
  });

  it('stays quiet when content and name agree or the content is unknown', () => {
    expect(extensionMismatch(info('jpeg', 'jpeg'), '/x/a.jpeg')).toBeNull();
    expect(extensionMismatch(info(null, 'tga'), '/x/a.tga')).toBeNull();
    expect(extensionMismatch(null, '/x/a.png')).toBeNull();
  });
});
