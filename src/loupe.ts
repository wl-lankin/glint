import type { App } from './app';
import { toHex } from './palette';
import { imagePoint } from './view';

const ZOOM = 11; // source pixels across the loupe
const SIZE = 176;

/** A magnifier with a pixel grid and the color under the cursor. Toggle with L, or hold Alt. */
export class Loupe {
  private on = false;
  private held = false;
  private readonly canvas: HTMLCanvasElement;
  private readonly label: HTMLElement;
  private readonly sample = document.createElement('canvas');
  private last: { x: number; y: number } | null = null;

  constructor(private readonly app: App) {
    this.canvas = app.root.querySelector('.loupe')!;
    this.label = app.root.querySelector('.loupe-label')!;
    this.sample.width = ZOOM;
    this.sample.height = ZOOM;
    window.addEventListener('pointermove', (e) => {
      this.last = { x: e.clientX, y: e.clientY };
      if (this.active) this.draw();
    });
  }

  get active() {
    return (this.on || this.held) && this.app.index >= 0 && !this.app.broken;
  }

  toggle() {
    this.on = !this.on;
    this.app.root.querySelector('[data-action="loupe"]')?.classList.toggle('on', this.on);
    this.refresh();
  }

  hold(down: boolean) {
    if (this.held === down) return;
    this.held = down;
    this.refresh();
  }

  private refresh() {
    this.app.root.classList.toggle('loupe-on', this.active);
    if (this.active) this.draw();
  }

  private draw() {
    const pos = this.last;
    const show = (visible: boolean) => {
      this.canvas.classList.toggle('show', visible);
      this.label.classList.toggle('show', visible);
    };
    if (!pos) return show(false);
    const stage = this.app.stage.getBoundingClientRect();
    const at = { x: pos.x - stage.left - stage.width / 2, y: pos.y - stage.top - stage.height / 2 };
    const p = imagePoint(this.app.view, this.app.natural, at);
    if (!p) return show(false);

    const img = this.app.slot.img;
    const ctx = this.sample.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, ZOOM, ZOOM);
    const half = Math.floor(ZOOM / 2);
    try {
      ctx.drawImage(img, p.x - half, p.y - half, ZOOM, ZOOM, 0, 0, ZOOM, ZOOM);
    } catch {
      return show(false);
    }
    let center: Uint8ClampedArray;
    try {
      center = ctx.getImageData(half, half, 1, 1).data;
    } catch {
      return show(false);
    }

    const out = this.canvas.getContext('2d')!;
    const cell = SIZE / ZOOM;
    out.clearRect(0, 0, SIZE, SIZE);
    out.imageSmoothingEnabled = false;
    out.drawImage(this.sample, 0, 0, SIZE, SIZE);
    out.strokeStyle = 'rgba(255,255,255,0.08)';
    out.lineWidth = 1;
    for (let i = 1; i < ZOOM; i++) {
      const v = Math.round(i * cell) + 0.5;
      out.beginPath();
      out.moveTo(v, 0);
      out.lineTo(v, SIZE);
      out.moveTo(0, v);
      out.lineTo(SIZE, v);
      out.stroke();
    }
    out.strokeStyle = '#fff';
    out.lineWidth = 2;
    out.strokeRect(half * cell + 1, half * cell + 1, cell - 2, cell - 2);

    const hex = toHex(center[0], center[1], center[2]);
    const alpha = center[3] < 255 ? ` · ${Math.round((center[3] / 255) * 100)}%` : '';
    this.label.innerHTML = '';
    const chip = document.createElement('i');
    chip.style.background = `rgba(${center[0]},${center[1]},${center[2]},${center[3] / 255})`;
    const text = document.createElement('span');
    text.textContent = `${hex}${alpha}  ·  ${p.x}, ${p.y}`;
    this.label.append(chip, text);

    const x = Math.min(window.innerWidth - SIZE - 12, pos.x + 22);
    const y = Math.min(window.innerHeight - SIZE - 48, pos.y + 22);
    this.canvas.style.transform = `translate(${x}px, ${y}px)`;
    this.label.style.transform = `translate(${x}px, ${y + SIZE + 8}px)`;
    show(true);
  }

  /** The hex under the cursor, for copying with a click while the loupe is on. */
  currentHex(): string | null {
    const text = this.label.textContent ?? '';
    return /#[0-9A-F]{6}/.exec(text)?.[0] ?? null;
  }
}
