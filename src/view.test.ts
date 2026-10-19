import { describe, expect, it } from 'vitest';
import { canPan, clampPan, fitScale, fitView, imagePoint, nextStop, zoomAt, type View } from './view';

const port = { w: 1000, h: 800 };

describe('fitScale', () => {
  it('fits a large image inside the margins', () => {
    expect(fitScale({ w: 4000, h: 2000 }, port, 0, false, 0)).toBeCloseTo(0.25);
    expect(fitScale({ w: 4000, h: 2000 }, port, 0, false, 50)).toBeCloseTo(900 / 4000);
  });

  it('swaps the sides for a quarter turn', () => {
    expect(fitScale({ w: 4000, h: 2000 }, port, 90, false, 0)).toBeCloseTo(800 / 4000);
  });

  it('keeps small rasters at 100% but blows up vectors', () => {
    expect(fitScale({ w: 32, h: 32 }, port, 0, false, 0)).toBe(1);
    expect(fitScale({ w: 32, h: 32 }, port, 0, true, 0)).toBeCloseTo(25);
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor in place', () => {
    const v: View = { scale: 1, x: 10, y: -20, rotation: 0, flip: false, mode: 'fit' };
    const at = { x: 200, y: 100 };
    const z = zoomAt(v, 2, at);
    expect(z.scale).toBe(2);
    expect(z.mode).toBe('free');
    // The image point under the cursor: (at - offset) / scale stays the same.
    expect((at.x - z.x) / z.scale).toBeCloseTo((at.x - v.x) / v.scale);
    expect((at.y - z.y) / z.scale).toBeCloseTo((at.y - v.y) / v.scale);
  });

  it('clamps to the zoom range', () => {
    const v = fitView({ w: 100, h: 100 }, port, 0, false, false);
    expect(zoomAt(v, 1e6, { x: 0, y: 0 }).scale).toBe(64);
    expect(zoomAt(v, 1e-6, { x: 0, y: 0 }).scale).toBe(0.02);
  });
});

describe('clampPan', () => {
  it('centers an axis that fits and limits one that does not', () => {
    const v: View = { scale: 1, x: 900, y: 300, rotation: 0, flip: false, mode: 'free' };
    const c = clampPan(v, { w: 1600, h: 400 }, port);
    expect(c.x).toBe(300);
    expect(c.y).toBe(0);
    expect(canPan(v, { w: 1600, h: 400 }, port)).toBe(true);
    expect(canPan(v, { w: 600, h: 400 }, port)).toBe(false);
  });
});

describe('imagePoint', () => {
  const image = { w: 200, h: 100 };
  const base: View = { scale: 2, x: 0, y: 0, rotation: 0, flip: false, mode: 'free' };

  it('maps the stage center to the image center', () => {
    expect(imagePoint(base, image, { x: 0, y: 0 })).toEqual({ x: 100, y: 50 });
  });

  it('maps corners through scale, mirror and rotation', () => {
    expect(imagePoint(base, image, { x: -199, y: -99 })).toEqual({ x: 0, y: 0 });
    expect(imagePoint({ ...base, flip: true }, image, { x: -199, y: -99 })).toEqual({ x: 199, y: 0 });
    // A quarter turn clockwise puts the image's top-left corner at the screen's top-right.
    expect(imagePoint({ ...base, rotation: 90 }, image, { x: 99, y: -199 })).toEqual({ x: 0, y: 0 });
    expect(imagePoint(base, image, { x: 500, y: 0 })).toBeNull();
  });
});

describe('nextStop', () => {
  it('steps through familiar zoom values', () => {
    expect(nextStop(1, 1)).toBe(1.5);
    expect(nextStop(1, -1)).toBe(0.75);
    expect(nextStop(0.3, 1)).toBe(0.333);
    expect(nextStop(64, 1)).toBe(64);
  });
});
