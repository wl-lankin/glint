import type { App } from './app';
import { icons } from './icons';
import { extractPalette, inkFor, toHex } from './palette';
import type { Settings } from './settings';
import { baseName, dirName, el, extension, formatBytes, formatDate, formatLabel, megapixels } from './util';

import logoUrl from '../assets/logo.svg';

const REPO = 'wl-lankin/glint';
const AUTHOR_URL = 'https://wolfgang-linz.de';
const FORMATS = ['PNG', 'JPEG', 'GIF', 'WebP', 'AVIF', 'SVG', 'HEIC', 'TIFF', 'PSD', 'JPEG XL', 'BMP', 'ICO', 'TGA', 'QOI', 'DDS', 'HDR', 'EXR', 'PNM'];

interface MenuItem {
  label: string;
  icon?: string;
  hint?: string;
  checked?: boolean;
  run?: () => void;
  submenu?: MenuItem[];
}

export class Panels {
  private readonly info: HTMLElement;
  private readonly palette: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly modals: HTMLElement;
  private readonly toasts: HTMLElement;
  private paletteFor = '';
  private stripFor: string[] = [];

  constructor(private readonly app: App) {
    const q = (s: string) => app.root.querySelector<HTMLElement>(s)!;
    this.info = q('.info-panel');
    this.palette = q('.palette-panel');
    this.sheet = q('.sheet');
    this.strip = q('.strip');
    this.menu = q('.menu');
    this.modals = q('.modal-layer');
    this.toasts = q('.toasts');

    this.strip.addEventListener('click', (e) => {
      const thumb = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (thumb) void app.goTo(Number(thumb.dataset.index));
    });
    this.strip.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        this.strip.scrollBy({ left: e.deltaY });
      }
    }, { passive: false });
    this.sheet.addEventListener('click', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (!tile) return;
      this.closeSheet();
      void app.goTo(Number(tile.dataset.index));
    });
    this.palette.addEventListener('click', (e) => {
      const sw = (e.target as HTMLElement).closest<HTMLElement>('[data-hex]');
      if (sw) void this.copyText(sw.dataset.hex!, `Copied ${sw.dataset.hex}`);
    });
    this.info.addEventListener('click', (e) => {
      const reveal = (e.target as HTMLElement).closest('[data-reveal]');
      if (reveal && app.current) void app.backend.reveal(app.current);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.menu.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-action="menu"]')) this.closeMenu();
    });
    this.modals.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.modals || t.closest('[data-close]')) this.closeModal();
      const link = t.closest<HTMLElement>('[data-href]');
      if (link) void app.backend.openUrl(link.dataset.href!);
    });
  }

  // ---------------------------------------------------------------- refresh after navigation

  refresh() {
    this.highlightStrip();
    if (this.app.root.classList.contains('info-open')) this.renderInfo();
    if (this.app.root.classList.contains('palette-open')) this.renderPalette();
    if (this.stripFor !== this.app.items) this.renderStrip();
  }

  renderFormats() {
    const box = this.app.root.querySelector('.formats')!;
    box.replaceChildren(...FORMATS.map((f) => el('span', 'chip', f)));
  }

  renderStrip() {
    this.stripFor = this.app.items;
    const frag = document.createDocumentFragment();
    this.app.items.forEach((path, i) => {
      const b = el('button', 'thumb');
      b.dataset.index = String(i);
      b.setAttribute('role', 'option');
      b.setAttribute('aria-label', baseName(path));
      const img = el('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = '';
      img.src = this.app.backend.url(path, true);
      b.append(img);
      frag.append(b);
    });
    this.strip.replaceChildren(frag);
    this.highlightStrip();
    if (this.app.root.classList.contains('sheet-open')) this.renderSheet();
  }

  highlightStrip() {
    const current = this.strip.querySelector('.current');
    current?.classList.remove('current');
    current?.setAttribute('aria-selected', 'false');
    const next = this.strip.children[this.app.index] as HTMLElement | undefined;
    if (!next) return;
    next.classList.add('current');
    next.setAttribute('aria-selected', 'true');
    const left = next.offsetLeft - this.strip.clientWidth / 2 + next.clientWidth / 2;
    this.strip.scrollTo({ left, behavior: 'smooth' });
  }

  renderBroken(path: string) {
    const box = this.app.root.querySelector<HTMLElement>('.broken')!;
    const text = box.querySelector<HTMLElement>('.broken-text')!;
    const ext = extension(path);
    text.textContent =
      ['heic', 'heif'].includes(ext) && this.app.backend.platform !== 'mac'
        ? `${baseName(path)} is HEIC. Windows can't decode it in this version of Glint; on macOS it opens.`
        : `${baseName(path)} is damaged or uses a variant Glint can't decode.`;
    box.hidden = false;
  }

  hideBroken() {
    this.app.root.querySelector<HTMLElement>('.broken')!.hidden = true;
  }

  // ---------------------------------------------------------------- info

  toggleInfo() {
    const open = this.app.root.classList.toggle('info-open');
    if (open) this.renderInfo();
  }

  private renderInfo() {
    const app = this.app;
    const path = app.current;
    if (!path) return;
    const info = app.info;
    const rows: [string, string][] = [];
    rows.push(['Format', formatLabel(info?.format, path)]);
    if (!app.broken) rows.push(['Dimensions', `${app.natural.w} × ${app.natural.h}`]);
    const mp = megapixels(app.natural.w, app.natural.h);
    if (mp && !app.broken) rows.push(['Resolution', mp]);
    if (info) rows.push(['File size', formatBytes(info.size)]);
    if (info?.modified) rows.push(['Modified', formatDate(info.modified)]);

    const head = el('div', 'panel-head');
    const title = el('div', 'panel-title');
    title.textContent = baseName(path);
    const folder = el('button', 'panel-path');
    folder.dataset.reveal = '';
    folder.title = 'Show in folder';
    folder.innerHTML = icons.reveal;
    const folderText = el('span');
    folderText.textContent = dirName(path) || path;
    folder.append(folderText);
    head.append(title, folder);

    const table = (list: [string, string][], heading?: string) => {
      const section = el('section', 'kv');
      if (heading) section.append(el('h3', '', heading));
      for (const [k, v] of list) {
        const row = el('div', 'kv-row');
        const key = el('span', 'k');
        key.textContent = k;
        const val = el('span', 'v');
        val.textContent = v;
        row.append(key, val);
        section.append(row);
      }
      return section;
    };

    const parts: HTMLElement[] = [head, table(rows)];
    const histogram = this.histogram();
    if (histogram) {
      const section = el('section', 'kv');
      section.append(el('h3', '', 'Histogram'), histogram);
      parts.push(section);
    }
    if (info?.exif.length) parts.push(table(info.exif, 'Camera'));
    this.info.replaceChildren(...parts);
  }

  private histogram(): HTMLCanvasElement | null {
    const src = this.app.renderToCanvas(160);
    if (!src) return null;
    let data: Uint8ClampedArray;
    try {
      data = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
    } catch {
      return null;
    }
    const bins = [new Float32Array(64), new Float32Array(64), new Float32Array(64)];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      bins[0][data[i] >> 2]++;
      bins[1][data[i + 1] >> 2]++;
      bins[2][data[i + 2] >> 2]++;
    }
    const max = Math.max(...bins.flatMap((b) => [...b]));
    const canvas = el('canvas', 'histogram');
    const w = 520;
    const h = 150;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'screen';
    const colors = ['rgba(255,92,120,0.75)', 'rgba(86,230,160,0.7)', 'rgba(96,150,255,0.8)'];
    bins.forEach((bin, c) => {
      ctx.beginPath();
      ctx.moveTo(0, h);
      bin.forEach((v, i) => ctx.lineTo((i / 63) * w, h - (max ? Math.sqrt(v / max) : 0) * (h - 6)));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = colors[c];
      ctx.fill();
    });
    return canvas;
  }

  // ---------------------------------------------------------------- palette

  togglePalette() {
    const open = this.app.root.classList.toggle('palette-open');
    if (open) this.renderPalette();
  }

  private renderPalette() {
    const path = this.app.current;
    if (!path || path === this.paletteFor) return;
    this.paletteFor = path;
    const src = this.app.renderToCanvas(72);
    let swatches: ReturnType<typeof extractPalette> = [];
    if (src) {
      try {
        swatches = extractPalette(src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data, 6);
      } catch {
        swatches = [];
      }
    }
    if (!swatches.length) {
      this.palette.replaceChildren(el('div', 'palette-empty', 'No colors to read'));
      return;
    }
    const nodes = swatches.map((s, i) => {
      const hex = toHex(s.r, s.g, s.b);
      const sw = el('button', 'swatch');
      sw.dataset.hex = hex;
      sw.style.setProperty('--c', hex);
      sw.style.setProperty('--ink', inkFor(s.r, s.g, s.b));
      sw.style.setProperty('--i', String(i));
      sw.title = `Copy ${hex}`;
      const label = el('span', 'swatch-hex');
      label.textContent = hex;
      const share = el('span', 'swatch-share');
      share.textContent = `${Math.round(s.share * 100)}%`;
      sw.append(label, share);
      return sw;
    });
    this.palette.replaceChildren(...nodes);
  }

  // ---------------------------------------------------------------- contact sheet

  toggleSheet() {
    if (this.app.root.classList.contains('sheet-open')) return this.closeSheet();
    if (this.app.items.length < 1) return;
    this.app.root.classList.add('sheet-open');
    this.app.slideshow.pause();
    this.renderSheet();
  }

  closeSheet() {
    this.app.root.classList.remove('sheet-open');
  }

  private renderSheet() {
    const app = this.app;
    this.sheet.querySelector('.sheet-title')!.textContent = `${app.items.length} image${app.items.length === 1 ? '' : 's'}`;
    const grid = this.sheet.querySelector<HTMLElement>('.sheet-grid')!;
    const frag = document.createDocumentFragment();
    app.items.forEach((path, i) => {
      const tile = el('button', 'tile');
      tile.dataset.index = String(i);
      tile.style.setProperty('--i', String(Math.min(i, 30)));
      if (i === app.index) tile.classList.add('current');
      const img = el('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = '';
      img.src = app.backend.url(path, true);
      const name = el('span', 'tile-name');
      name.textContent = baseName(path);
      tile.append(img, name);
      frag.append(tile);
    });
    grid.replaceChildren(frag);
    requestAnimationFrame(() => grid.querySelector('.current')?.scrollIntoView({ block: 'center' }));
  }

  // ---------------------------------------------------------------- clipboard

  async copyImage() {
    const canvas = this.app.renderToCanvas();
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('empty');
      await this.app.backend.copyPng(new Uint8Array(await blob.arrayBuffer()));
      this.toast('Image copied');
    } catch {
      this.toast('Could not copy the image');
    }
  }

  async copyText(text: string, message: string) {
    try {
      await this.app.backend.copyText(text);
      this.toast(message);
    } catch {
      this.toast('Could not copy');
    }
  }

  // ---------------------------------------------------------------- toast

  toast(message: string) {
    const t = el('div', 'toast');
    t.textContent = message;
    this.toasts.replaceChildren(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 400);
    }, 1600);
  }

  // ---------------------------------------------------------------- menus

  openMenu(anchor: HTMLElement) {
    if (this.menu.classList.contains('show')) return this.closeMenu();
    const r = anchor.getBoundingClientRect();
    this.showMenu(this.mainMenu(), r.right, r.bottom + 8, 'right');
  }

  openContextMenu(x: number, y: number) {
    const app = this.app;
    const items: MenuItem[] = [
      { label: 'Copy image', icon: icons.copy, hint: this.mod('C'), run: () => void this.copyImage() },
      { label: 'Copy path', icon: icons.path, run: () => app.current && void this.copyText(app.current, 'Path copied') },
      { label: app.backend.platform === 'mac' ? 'Show in Finder' : 'Show in Explorer', icon: icons.reveal, run: () => app.current && void app.backend.reveal(app.current) },
      { label: '' },
      { label: 'Rotate', icon: icons.rotate, hint: 'R', run: () => app.rotate(90) },
      { label: 'Mirror', icon: icons.flip, hint: 'F', run: () => app.flip() },
      { label: 'Info', icon: icons.info, hint: 'I', run: () => this.toggleInfo() },
    ];
    this.showMenu(items, x, y, 'left');
  }

  private mod(key: string) {
    return this.app.backend.platform === 'mac' ? `⌘${key}` : `Ctrl+${key}`;
  }

  private mainMenu(): MenuItem[] {
    const app = this.app;
    const s = app.settings;
    const choose = <K extends keyof Settings>(key: K, value: Settings[K]) => () => app.update({ [key]: value } as Partial<Settings>);
    return [
      { label: 'Copy image', icon: icons.copy, hint: this.mod('C'), run: () => void this.copyImage() },
      { label: app.backend.platform === 'mac' ? 'Show in Finder' : 'Show in Explorer', icon: icons.reveal, run: () => app.current && void app.backend.reveal(app.current) },
      { label: '' },
      {
        label: 'Slideshow',
        submenu: [
          ...[3, 5, 8, 12].map((n) => ({ label: `${n} seconds`, checked: s.interval === n, run: choose('interval', n) })),
          { label: '' },
          { label: 'Ken Burns', checked: s.transition === 'kenburns', run: choose('transition', 'kenburns') },
          { label: 'Crossfade', checked: s.transition === 'fade', run: choose('transition', 'fade') },
          { label: 'Cut', checked: s.transition === 'none', run: choose('transition', 'none') },
          { label: '' },
          { label: 'Start by itself', checked: s.autoplay, run: () => app.update({ autoplay: !s.autoplay }) },
        ],
      },
      {
        label: 'Backdrop',
        submenu: [
          { label: 'Ambient', checked: s.backdrop === 'auto', run: choose('backdrop', 'auto') },
          { label: 'Checkerboard', checked: s.backdrop === 'checker', run: choose('backdrop', 'checker') },
          { label: 'Black', checked: s.backdrop === 'black', run: choose('backdrop', 'black') },
          { label: 'White', checked: s.backdrop === 'white', run: choose('backdrop', 'white') },
        ],
      },
      {
        label: 'Theme',
        submenu: [
          { label: 'Dark', checked: s.theme === 'dark', run: choose('theme', 'dark') },
          { label: 'Light', checked: s.theme === 'light', run: choose('theme', 'light') },
          { label: 'Follow system', checked: s.theme === 'system', run: choose('theme', 'system') },
        ],
      },
      { label: '' },
      { label: 'Keyboard shortcuts', icon: icons.keyboard, hint: '?', run: () => this.openHelp() },
      { label: 'About Glint', icon: icons.image, run: () => this.openAbout() },
    ];
  }

  private showMenu(items: MenuItem[], x: number, y: number, align: 'left' | 'right') {
    const build = (list: MenuItem[]): HTMLElement => {
      const box = el('div', 'menu-list');
      for (const item of list) {
        if (!item.label) {
          box.append(el('div', 'menu-sep'));
          continue;
        }
        const row = el('button', 'menu-item');
        row.setAttribute('role', 'menuitem');
        const icon = el('span', 'menu-icon');
        if (item.checked) icon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
        else if (item.icon) icon.innerHTML = item.icon;
        const label = el('span', 'menu-label');
        label.textContent = item.label;
        row.append(icon, label);
        if (item.hint) {
          const hint = el('kbd', 'menu-hint');
          hint.textContent = item.hint;
          row.append(hint);
        }
        if (item.submenu) {
          row.classList.add('has-sub');
          row.append(el('span', 'menu-caret', icons.next));
          const sub = build(item.submenu);
          sub.classList.add('submenu');
          row.append(sub);
        } else {
          row.addEventListener('click', () => {
            this.closeMenu();
            item.run?.();
          });
        }
        box.append(row);
      }
      return box;
    };
    this.menu.replaceChildren(build(items));
    this.menu.classList.add('show');
    const w = this.menu.offsetWidth;
    const h = this.menu.offsetHeight;
    const left = align === 'right' ? x - w : x;
    this.menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`;
    this.menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
    this.menu.classList.toggle('flip-sub', left + w * 2 > window.innerWidth);
  }

  closeMenu() {
    this.menu.classList.remove('show');
  }

  // ---------------------------------------------------------------- modals

  private openModal(content: HTMLElement, className: string) {
    const card = el('div', `modal ${className}`);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const close = el('button', 'modal-close', icons.close);
    close.dataset.close = '';
    close.setAttribute('aria-label', 'Close');
    card.append(close, content);
    this.modals.replaceChildren(card);
    this.app.root.classList.add('modal-open');
    this.app.slideshow.pause();
  }

  closeModal() {
    this.app.root.classList.remove('modal-open');
    setTimeout(() => {
      if (!this.app.root.classList.contains('modal-open')) this.modals.replaceChildren();
    }, 300);
  }

  openHelp() {
    const mod = this.app.backend.platform === 'mac' ? '⌘' : 'Ctrl';
    const groups: [string, [string, string][]][] = [
      ['Browse', [['← →', 'Previous / next'], ['Home End', 'First / last'], ['Space', 'Play / pause slideshow'], ['G', 'Contact sheet'], ['O', 'Open images']]],
      ['View', [['Wheel', 'Zoom at cursor'], ['0', 'Fit to window'], ['1', 'Actual size'], ['+ −', 'Zoom in / out'], ['Double-click', 'Zoom in / fit'], ['R  Shift R', 'Rotate'], ['F', 'Mirror'], ['Enter', 'Fullscreen']]],
      ['Look closer', [['I', 'Info and histogram'], ['P', 'Color palette'], ['L / hold Alt', 'Pixel loupe'], ['A', 'Ambient light'], ['B', 'Backdrop for transparency'], [`${mod} C`, 'Copy image']]],
    ];
    const body = el('div', 'help');
    body.append(el('h2', '', 'Keyboard shortcuts'));
    const cols = el('div', 'help-cols');
    for (const [title, keys] of groups) {
      const col = el('section');
      col.append(el('h3', '', title));
      for (const [k, v] of keys) {
        const row = el('div', 'help-row');
        const keysBox = el('span', 'help-keys');
        k.split(/\s+/).forEach((part) => {
          const kbd = el('kbd');
          kbd.textContent = part;
          keysBox.append(kbd);
        });
        const label = el('span');
        label.textContent = v;
        row.append(keysBox, label);
        col.append(row);
      }
      cols.append(col);
    }
    body.append(cols);
    this.openModal(body, 'modal-help');
  }

  openAbout() {
    const body = el('div', 'about');
    body.innerHTML = `
      <div class="about-mark"><div class="about-halo"></div><img src="${logoUrl}" alt="" width="112" height="112" /></div>
      <h2 class="wordmark">Glint</h2>
      <p class="about-version">Version <span data-version>1.0.0</span></p>
      <p class="about-tagline">Every image. Instantly.</p>
      <div class="about-card">
        <span class="about-label">Designed &amp; built by</span>
        <span class="about-name">Wolfgang Linz</span>
        <button class="about-link" data-href="${AUTHOR_URL}">wolfgang-linz.de ${icons.external}</button>
      </div>
      <div class="about-row">
        <button class="ghost-btn" data-href="https://github.com/${REPO}">${icons.github}<span>Source on GitHub</span></button>
        <span class="about-update" data-update>Checking for updates…</span>
      </div>
      <p class="about-legal">MIT License · © 2026 Wolfgang Linz</p>`;
    this.openModal(body, 'modal-about');
    this.renderUpdate();
    void this.app.backend.version().then((v) => {
      body.querySelector('[data-version]')!.textContent = v;
    });
    const updates = this.app.backend.updates;
    if (updates.state.phase === 'current' || updates.state.phase === 'error') void updates.check();
  }

  /** The update line in the About dialog, kept in step with the updater. */
  renderUpdate() {
    const target = this.modals.querySelector<HTMLElement>('[data-update]');
    if (!target) return;
    const s = this.app.backend.updates.state;
    target.replaceChildren();
    switch (s.phase) {
      case 'checking':
        target.textContent = 'Checking for updates…';
        return;
      case 'current':
        target.textContent = 'You have the latest version';
        return;
      case 'downloading':
        target.textContent = `Downloading ${s.version}… ${Math.round((s.progress ?? 0) * 100)}%`;
        return;
      case 'installing':
        target.textContent = `Installing ${s.version}…`;
        return;
      case 'ready': {
        const button = el('button', 'about-new');
        button.textContent = `Restart to update to ${s.version}`;
        button.addEventListener('click', () => void this.app.backend.updates.installNow());
        target.append(button);
        return;
      }
      case 'error':
        target.textContent = 'Could not check for updates';
        return;
      default:
        target.textContent = 'Updates install by themselves';
    }
  }

  /** Overlays take Escape and their own keys first. */
  handleKey(e: KeyboardEvent): boolean {
    const root = this.app.root;
    if (e.key === 'Escape') {
      if (this.menu.classList.contains('show')) return (this.closeMenu(), true);
      if (root.classList.contains('modal-open')) return (this.closeModal(), true);
      if (root.classList.contains('sheet-open')) return (this.closeSheet(), true);
    }
    if (root.classList.contains('modal-open')) return e.key !== 'Escape' && !e.ctrlKey && !e.metaKey;
    if (root.classList.contains('sheet-open') && e.key === 'Enter') return (this.closeSheet(), true);
    return false;
  }
}
