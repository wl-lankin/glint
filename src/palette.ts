// Dominant colors of an image: k-means over a small RGBA sample, seeded deterministically
// (k-means++ with the farthest point instead of a random draw) so the same image always gives the
// same palette.

export interface Swatch {
  r: number;
  g: number;
  b: number;
  share: number;
}

const dist2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export function extractPalette(rgba: Uint8ClampedArray, k = 6, iterations = 10): Swatch[] {
  const points: number[][] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    points.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  }
  if (points.length === 0) return [];

  // Seed: the mean color, then repeatedly the point farthest from every chosen center.
  const mean = [0, 1, 2].map((c) => points.reduce((s, p) => s + p[c], 0) / points.length);
  let first = points[0];
  for (const p of points) if (dist2(p, mean) < dist2(first, mean)) first = p;
  const centers: number[][] = [first.slice()];
  const nearest = points.map((p) => dist2(p, first));
  while (centers.length < k) {
    let best = -1;
    let bestD = 0;
    for (let i = 0; i < points.length; i++) {
      if (nearest[i] > bestD) {
        bestD = nearest[i];
        best = i;
      }
    }
    if (best < 0 || bestD < 64) break; // every remaining color is already close to a center
    const c = points[best].slice();
    centers.push(c);
    for (let i = 0; i < points.length; i++) nearest[i] = Math.min(nearest[i], dist2(points[i], c));
  }

  const assign = new Int32Array(points.length);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(points[i], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
      const s = sums[best];
      s[0] += points[i][0];
      s[1] += points[i][1];
      s[2] += points[i][2];
      s[3]++;
    }
    let moved = false;
    sums.forEach((s, c) => {
      if (s[3] === 0) return;
      const next = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
      if (dist2(next, centers[c]) > 0.25) moved = true;
      centers[c] = next;
    });
    if (!moved) break;
  }

  const counts = new Array(centers.length).fill(0);
  for (const a of assign) counts[a]++;
  return centers
    .map((c, i) => ({ r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]), share: counts[i] / points.length }))
    .filter((s) => s.share > 0)
    .sort((a, b) => b.share - a.share);
}

export const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Readable text color on top of a swatch (WCAG relative luminance). */
export function inkFor(r: number, g: number, b: number): '#000' | '#fff' {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return l > 0.36 ? '#000' : '#fff';
}

/**
 * Whether a transparent image needs a contrasting card behind it: 'light' when its visible pixels
 * are dark (a black SVG on a dark window), 'dark' when they are light, null for opaque images and
 * for content that reads on either background.
 */
export function backdropNeed(rgba: Uint8ClampedArray): 'light' | 'dark' | null {
  let total = 0;
  let transparent = 0;
  let weight = 0;
  let luminance = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    total++;
    const a = rgba[i + 3] / 255;
    if (a < 0.98) transparent++;
    if (a < 0.12) continue;
    const lin = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    luminance += a * (0.2126 * lin(rgba[i]) + 0.7152 * lin(rgba[i + 1]) + 0.0722 * lin(rgba[i + 2]));
    weight += a;
  }
  if (total === 0 || weight === 0 || transparent / total < 0.02) return null;
  const mean = luminance / weight;
  if (mean < 0.06) return 'light';
  if (mean > 0.6) return 'dark';
  return null;
}
