// Geometry of the image on the stage. Offsets are in screen pixels from the stage center.

export type Rotation = 0 | 90 | 180 | 270;

export interface View {
  scale: number;
  x: number;
  y: number;
  rotation: Rotation;
  flip: boolean;
  /** 'fit' follows the window size; any zoom or pan switches to 'free'. */
  mode: 'fit' | 'free';
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 64;
export const FIT_MARGIN = 48;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The image size on screen axes, after rotation. */
export function rotated(image: Size, rotation: Rotation): Size {
  return rotation % 180 === 0 ? image : { w: image.h, h: image.w };
}

/** Largest scale that shows the whole image. Small raster images are not blown up; vectors are. */
export function fitScale(image: Size, viewport: Size, rotation: Rotation, upscale: boolean, margin = FIT_MARGIN): number {
  const r = rotated(image, rotation);
  const vw = Math.max(1, viewport.w - margin * 2);
  const vh = Math.max(1, viewport.h - margin * 2);
  const s = Math.min(vw / r.w, vh / r.h);
  return upscale ? s : Math.min(1, s);
}

export function fitView(image: Size, viewport: Size, rotation: Rotation, flip: boolean, upscale: boolean): View {
  return { scale: fitScale(image, viewport, rotation, upscale), x: 0, y: 0, rotation, flip, mode: 'fit' };
}

/** Zooms by `factor` keeping the point `at` (relative to the stage center) under the cursor. */
export function zoomAt(view: View, factor: number, at: { x: number; y: number }): View {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const k = scale / view.scale;
  return { ...view, scale, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k, mode: 'free' };
}

/** Keeps the image on screen: centered on an axis where it fits, edges never past the window. */
export function clampPan(view: View, image: Size, viewport: Size): View {
  const r = rotated(image, view.rotation);
  const w = r.w * view.scale;
  const h = r.h * view.scale;
  const limit = (size: number, port: number, v: number) => (size <= port ? 0 : clamp(v, -(size - port) / 2, (size - port) / 2));
  return { ...view, x: limit(w, viewport.w, view.x), y: limit(h, viewport.h, view.y) };
}

/** True when the image is larger than the window, so a drag pans instead of swiping. */
export function canPan(view: View, image: Size, viewport: Size): boolean {
  const r = rotated(image, view.rotation);
  return r.w * view.scale > viewport.w + 1 || r.h * view.scale > viewport.h + 1;
}

/** Image pixel under a stage point (relative to the stage center), or null outside the image. */
export function imagePoint(view: View, image: Size, at: { x: number; y: number }): { x: number; y: number } | null {
  let dx = (at.x - view.x) / view.scale;
  let dy = (at.y - view.y) / view.scale;
  // Undo the rotation (clockwise on screen), then the mirror.
  const turns = view.rotation / 90;
  for (let i = 0; i < turns; i++) [dx, dy] = [dy, -dx];
  if (view.flip) dx = -dx;
  const x = Math.floor(dx + image.w / 2);
  const y = Math.floor(dy + image.h / 2);
  return x >= 0 && y >= 0 && x < image.w && y < image.h ? { x, y } : null;
}

/** Steps for the zoom buttons and keys, so repeated presses land on familiar values. */
const STOPS = [0.05, 0.1, 0.125, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

export function nextStop(scale: number, direction: 1 | -1): number {
  if (direction > 0) return STOPS.find((s) => s > scale * 1.01) ?? MAX_SCALE;
  return [...STOPS].reverse().find((s) => s < scale * 0.99) ?? MIN_SCALE;
}
