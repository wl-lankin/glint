import type { Backend, FileInfo } from './backend';
import { icons } from './icons';
import { Loupe } from './loupe';
import { Panels } from './panels';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Slideshow } from './slideshow';
import { baseName, extension, formatLabel } from './util';
import { canPan, clampPan, fitView, nextStop, zoomAt, type Size, type View } from './view';

interface Slot {
  slide: HTMLElement;
  kb: HTMLElement;
  img: HTMLImageElement;
}

const VECTOR = new Set(['svg']);
const OPAQUE = new Set(['jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp']);
const HUD_IDLE_MS = 1800;

export class App {
  readonly root = document.getElementById('app')!;
  readonly stage = document.getElementById('stage')!;
  private readonly slots: Slot[];
  private active = 0;
  private readonly ambientGlows: HTMLElement[];
  private activeGlow = 0;

  items: string[] = [];
  index = -1;
  /** 'set' when the user opened several files together; 'folder' when one file brought its folder. */
  source: 'set' | 'folder' = 'folder';
  natural: Size = { w: 1, h: 1 };
  view: View = { scale: 1, x: 0, y: 0, rotation: 0, flip: false, mode: 'fit' };
  info: FileInfo | null = null;
  settings: Settings = loadSettings();
  broken = false;

  readonly slideshow: Slideshow;
  readonly panels: Panels;
  readonly loupe: Loupe;
  private loadToken = 0;
  private hudTimer = 0;
  private hudPinned = false;
  private fullscreen = false;

  constructor(readonly backend: Backend) {
    this.slots = [...this.stage.querySelectorAll<HTMLElement>('.slide')].map((slide) => ({
      slide,
      kb: slide.querySelector('.kb') as HTMLElement,
      img: slide.querySelector('img') as HTMLImageElement,
    }));
    this.ambientGlows = [...this.root.querySelectorAll<HTMLElement>('.ambient .glow')];
    this.slideshow = new Slideshow(
      this.settings.interval * 1000,
      () => void this.go(1),
      (playing, progress) => this.renderPlay(playing, progress),
    );
    this.panels = new Panels(this);
    this.loupe = new Loupe(this);
  }

  async start() {
    this.root.dataset.platform = this.backend.platform;
    this.applySettings();
    this.paintIcons();
    this.bindUi();
    this.bindStage();
    this.bindKeys();
    this.bindHud();
    this.startClock();
    this.backend.onOpenFiles((paths) => void this.open(paths));
    this.backend.onDragDrop((e) => {
      this.root.classList.toggle('is-dropping', e.type === 'over');
      if (e.type === 'drop' && e.paths?.length) void this.open(e.paths);
    });
    this.backend.onMaximizedChange((max) => {
      this.root.classList.toggle('is-maximized', max);
      const btn = this.root.querySelector<HTMLElement>('[data-action="win-max"]')!;
      btn.innerHTML = max ? icons.winRestore : icons.winMax;
      btn.setAttribute('aria-label', max ? 'Restore' : 'Maximize');
    });
    this.backend.updates.onChange((s) => {
      const pill = this.root.querySelector<HTMLButtonElement>('.update-pill')!;
      pill.hidden = s.phase !== 'ready' && s.phase !== 'installing';
      pill.disabled = s.phase === 'installing';
      pill.querySelector('.update-text')!.textContent = s.phase === 'installing' ? 'Updating…' : `Restart to update to ${s.version}`;
      this.panels.renderUpdate();
    });
    new ResizeObserver(() => this.onResize()).observe(this.stage);
    const files = await this.backend.ready();
    if (files.length) await this.open(files);
    else this.panels.renderFormats();
  }

  // ---------------------------------------------------------------- opening and navigation

  async open(paths: string[]) {
    if (!paths.length) return;
    this.panels.closeSheet();
    if (paths.length > 1) {
      this.source = 'set';
      // The files of a selection arrive in whatever order their processes started: sort them by name.
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      this.items = [...paths].sort((a, b) => collator.compare(baseName(a), baseName(b)));
      await this.show(0, 0);
      if (this.settings.autoplay) this.slideshow.play();
    } else {
      this.source = 'folder';
      this.slideshow.pause();
      this.items = paths;
      await this.show(0, 0);
      const siblings = await this.backend.siblings(paths[0]).catch(() => paths);
      if (this.items[0] === paths[0] && this.items.length === 1) {
        this.items = siblings;
        this.index = Math.max(0, siblings.indexOf(paths[0]));
        this.renderMeta();
        this.panels.renderStrip();
      }
    }
    this.root.classList.remove('is-empty');
  }

  get current(): string | undefined {
    return this.items[this.index];
  }

  async go(step: number) {
    if (this.items.length < 2) {
      this.slideshow.restart();
      return;
    }
    const n = this.items.length;
    await this.show((((this.index + step) % n) + n) % n, Math.sign(step));
  }

  async goTo(index: number) {
    if (index === this.index) return;
    await this.show(index, index > this.index ? 1 : -1);
  }

  async show(index: number, direction: number) {
    const path = this.items[index];
    if (path === undefined) return;
    const token = ++this.loadToken;
    this.index = index;
    this.slideshow.held = true;
    const next = this.slots[1 - this.active];
    const img = next.img;
    img.crossOrigin = 'anonymous';
    img.src = this.backend.url(path);
    this.renderMeta();
    this.panels.highlightStrip();

    let ok = true;
    try {
      await img.decode();
    } catch {
      ok = false;
    }
    if (token !== this.loadToken) return;

    this.broken = !ok;
    this.root.classList.toggle('is-broken', !ok);
    if (!ok) {
      this.panels.renderBroken(path);
      this.slots[this.active].slide.classList.remove('active');
      next.slide.classList.remove('active');
      this.info = null;
      this.afterShow(path, token);
      return;
    }

    this.panels.hideBroken();
    this.natural = { w: img.naturalWidth || 1000, h: img.naturalHeight || 1000 };
    const ext = extension(path);
    img.classList.toggle('is-opaque', OPAQUE.has(ext));
    img.classList.toggle('is-vector', VECTOR.has(ext));
    this.view = fitView(this.natural, this.stageSize(), 0, false, this.upscales());
    this.applyView(next, false);

    const from = this.slots[this.active];
    // The incoming slide starts a little to the side it comes from, the outgoing one drifts away.
    next.slide.style.transition = 'none';
    next.slide.style.setProperty('--offset', `${direction * 28}px`);
    void next.slide.offsetWidth;
    next.slide.style.transition = '';
    from.slide.style.setProperty('--offset', `${-direction * 28}px`);
    from.slide.classList.remove('active');
    next.slide.classList.add('active');
    this.active = 1 - this.active;
    this.restartKenBurns();
    this.setAmbient(path);
    this.afterShow(path, token);
  }

  private afterShow(path: string, token: number) {
    this.slideshow.restart();
    this.renderMeta();
    this.backend.setTitle(`${baseName(path)} - Glint`);
    this.preload();
    void this.backend
      .info(path)
      .then((info) => {
        if (token !== this.loadToken) return;
        this.info = info;
        this.renderMeta();
        this.panels.refresh();
      })
      .catch(() => {});
    this.panels.refresh();
  }

  private preload() {
    for (const step of [1, -1, 2]) {
      const n = this.items.length;
      if (n < 2) return;
      const path = this.items[(((this.index + step) % n) + n) % n];
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.src = this.backend.url(path);
    }
  }

  private upscales(): boolean {
    return this.current !== undefined && VECTOR.has(extension(this.current));
  }

  // ---------------------------------------------------------------- view

  get slot(): Slot {
    return this.slots[this.active];
  }

  stageSize(): Size {
    return { w: this.stage.clientWidth, h: this.stage.clientHeight };
  }

  applyView(slot = this.slot, animate = false) {
    const { img } = slot;
    const v = this.view;
    img.classList.toggle('animate', animate);
    img.style.width = `${this.natural.w * v.scale}px`;
    img.style.height = `${this.natural.h * v.scale}px`;
    img.style.transform = `translate(-50%, -50%) translate(${v.x}px, ${v.y}px) rotate(${v.rotation}deg) scaleX(${v.flip ? -1 : 1})`;
    img.classList.toggle('pixelated', v.scale >= 3 && !img.classList.contains('is-vector'));
    this.stage.classList.toggle('can-pan', canPan(v, this.natural, this.stageSize()));
    if (slot === this.slot) {
      const label = this.root.querySelector<HTMLElement>('.zoom-label')!;
      label.textContent = `${Math.round(v.scale * 100)}%`;
      label.classList.toggle('is-fit', v.mode === 'fit');
      this.root.classList.toggle('is-zoomed', v.mode === 'free');
    }
  }

  setView(view: View, animate = false) {
    this.view = clampPan(view, this.natural, this.stageSize());
    if (this.view.mode === 'free') this.stopKenBurns();
    this.applyView(this.slot, animate);
  }

  fit(animate = true) {
    this.setView(fitView(this.natural, this.stageSize(), this.view.rotation, this.view.flip, this.upscales()), animate);
    this.restartKenBurns();
  }

  actualSize(at = { x: 0, y: 0 }) {
    this.setView(zoomAt(this.view, 1 / this.view.scale, at), true);
  }

  zoomStep(direction: 1 | -1, at = { x: 0, y: 0 }) {
    const target = nextStop(this.view.scale, direction);
    this.setView(zoomAt(this.view, target / this.view.scale, at), true);
  }

  rotate(by: 90 | -90) {
    const rotation = ((((this.view.rotation + by) % 360) + 360) % 360) as View['rotation'];
    if (this.view.mode === 'fit') this.setView(fitView(this.natural, this.stageSize(), rotation, this.view.flip, this.upscales()), true);
    else this.setView({ ...this.view, rotation }, true);
  }

  flip() {
    this.setView({ ...this.view, flip: !this.view.flip }, true);
  }

  private onResize() {
    if (this.index < 0 || this.broken) return;
    if (this.view.mode === 'fit') this.setView(fitView(this.natural, this.stageSize(), this.view.rotation, this.view.flip, this.upscales()));
    else this.setView(this.view);
  }

  private restartKenBurns() {
    const kb = this.slot.kb;
    const on = this.settings.transition === 'kenburns' && this.slideshow.playing && this.view.mode === 'fit';
    kb.classList.remove('kb-on');
    if (!on) return;
    const pick = () => (Math.random() * 2 - 1).toFixed(2);
    kb.style.setProperty('--kb-x', pick());
    kb.style.setProperty('--kb-y', pick());
    kb.style.setProperty('--kb-dur', `${this.settings.interval + 1.2}s`);
    void kb.offsetWidth;
    kb.classList.add('kb-on');
  }

  private stopKenBurns() {
    this.slots.forEach((s) => s.kb.classList.remove('kb-on'));
  }

  private setAmbient(path: string) {
    const next = this.ambientGlows[1 - this.activeGlow];
    next.style.backgroundImage = `url("${this.backend.url(path, true).replace(/"/g, '%22')}")`;
    this.ambientGlows[this.activeGlow].classList.remove('active');
    next.classList.add('active');
    this.activeGlow = 1 - this.activeGlow;
  }

  // ---------------------------------------------------------------- settings

  update(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.applySettings();
  }

  applySettings() {
    const s = this.settings;
    const dark = s.theme === 'dark' || (s.theme === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
    this.root.dataset.theme = dark ? 'dark' : 'light';
    this.root.dataset.backdrop = s.backdrop;
    this.root.classList.toggle('ambient-off', !s.ambient);
    this.root.querySelector('[data-action="ambient"]')?.classList.toggle('on', s.ambient);
    this.slideshow.interval = s.interval * 1000;
    this.stage.style.setProperty('--fade', s.transition === 'none' ? '0ms' : '650ms');
  }

  cycleBackdrop() {
    const order: Settings['backdrop'][] = ['auto', 'checker', 'black', 'white'];
    const backdrop = order[(order.indexOf(this.settings.backdrop) + 1) % order.length];
    this.update({ backdrop });
    const names = { auto: 'Backdrop: ambient', checker: 'Backdrop: checkerboard', black: 'Backdrop: black', white: 'Backdrop: white' };
    this.panels.toast(names[backdrop]);
  }

  // ---------------------------------------------------------------- chrome

  renderMeta() {
    const path = this.current;
    const name = this.root.querySelector<HTMLElement>('.topbar .name')!;
    const meta = this.root.querySelector<HTMLElement>('.topbar .meta')!;
    if (!path) {
      name.textContent = '';
      meta.textContent = '';
      return;
    }
    name.textContent = baseName(path);
    const parts: string[] = [];
    if (this.items.length > 1) parts.push(`${this.index + 1} / ${this.items.length}`);
    if (!this.broken && this.natural.w > 1) parts.push(`${this.natural.w} × ${this.natural.h}`);
    parts.push(formatLabel(this.info?.format, path));
    meta.textContent = parts.join('  ·  ');
    this.root.classList.toggle('has-many', this.items.length > 1);
    this.root.classList.toggle('is-set', this.source === 'set');
  }

  renderPlay(playing: boolean, progress: number) {
    const play = this.root.querySelector<HTMLElement>('.play');
    if (!play) return;
    if (play.dataset.playing !== String(playing)) {
      play.dataset.playing = String(playing);
      play.querySelector('.play-icon')!.innerHTML = playing ? icons.pause : icons.play;
      this.root.classList.toggle('is-playing', playing);
      if (playing) this.restartKenBurns();
      else this.stopKenBurns();
    }
    play.style.setProperty('--progress', String(progress));
  }

  private paintIcons() {
    const map: Record<string, string> = {
      open: icons.open, info: icons.info, palette: icons.palette, grid: icons.grid, ambient: icons.ambient, menu: icons.more,
      prev: icons.prev, next: icons.next, 'zoom-in': icons.zoomIn, 'zoom-out': icons.zoomOut, rotate: icons.rotate,
      flip: icons.flip, backdrop: icons.backdrop, loupe: icons.loupe, fullscreen: icons.fullscreen,
      'win-min': icons.winMin, 'win-max': icons.winMax, 'win-close': icons.winClose,
    };
    this.root.querySelectorAll<HTMLElement>('.icon-btn[data-action], .win-btn[data-action]').forEach((b) => {
      const icon = map[b.dataset.action!];
      if (icon) b.innerHTML = icon;
    });
    this.root.querySelector('.sheet-head .icon-btn')!.innerHTML = icons.close;
    this.root.querySelector('.play-icon')!.innerHTML = icons.play;
    this.root.querySelector('.broken-icon')!.innerHTML = icons.broken;
    this.root.querySelector('.drop-glyph')!.innerHTML = icons.image;
    const mod = this.backend.platform === 'mac' ? '⌘' : 'Ctrl+';
    this.root.querySelector('[data-key-open]')!.textContent = `${mod}O`;
  }

  async toggleFullscreen(force?: boolean) {
    const on = force ?? !(await this.backend.isFullscreen());
    await this.backend.setFullscreen(on);
    this.fullscreen = on;
    this.root.classList.toggle('is-fullscreen', on);
    this.root.querySelector<HTMLElement>('[data-action="fullscreen"]')!.innerHTML = on ? icons.fullscreenExit : icons.fullscreen;
  }

  async openDialog() {
    const files = await this.backend.openDialog();
    if (files.length) await this.open(files);
  }

  togglePlay() {
    if (this.items.length < 2) return;
    this.slideshow.toggle();
    if (this.slideshow.playing) {
      if (this.view.mode === 'free') this.fit();
      this.panels.toast(`Slideshow · ${this.settings.interval} s`);
    }
  }

  private run(action: string, anchor?: HTMLElement) {
    switch (action) {
      case 'open': return void this.openDialog();
      case 'info': return this.panels.toggleInfo();
      case 'palette': return this.panels.togglePalette();
      case 'grid': return this.panels.toggleSheet();
      case 'ambient': this.update({ ambient: !this.settings.ambient }); return this.panels.toast(this.settings.ambient ? 'Ambient light on' : 'Ambient light off');
      case 'menu': return this.panels.openMenu(anchor!);
      case 'prev': return void this.go(-1);
      case 'next': return void this.go(1);
      case 'play': return this.togglePlay();
      case 'zoom-in': return this.zoomStep(1);
      case 'zoom-out': return this.zoomStep(-1);
      case 'zoom-toggle': return this.view.mode === 'fit' ? this.actualSize() : this.fit();
      case 'rotate': return this.rotate(90);
      case 'flip': return this.flip();
      case 'backdrop': return this.cycleBackdrop();
      case 'loupe': return this.loupe.toggle();
      case 'fullscreen': return void this.toggleFullscreen();
      case 'update': return void this.backend.updates.installNow();
      case 'win-min': return this.backend.minimize();
      case 'win-max': return this.backend.toggleMaximize();
      case 'win-close': return this.backend.close();
    }
  }

  private bindUi() {
    this.root.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target || target.closest('.menu, .modal-layer')) return;
      this.run(target.dataset.action!, target);
    });
    // Tooltips: one floating element, positioned under the hovered button.
    const tip = this.root.querySelector<HTMLElement>('.tooltip')!;
    let tipTimer = 0;
    this.root.addEventListener('pointerover', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      clearTimeout(tipTimer);
      if (!target) {
        tip.classList.remove('show');
        return;
      }
      tipTimer = window.setTimeout(() => {
        tip.textContent = target.dataset.tip!;
        const r = target.getBoundingClientRect();
        const above = r.top > window.innerHeight / 2;
        tip.style.left = `${r.left + r.width / 2}px`;
        tip.style.top = above ? `${r.top - 10}px` : `${r.bottom + 10}px`;
        tip.classList.toggle('above', above);
        tip.classList.add('show');
      }, 450);
    });
    this.root.addEventListener('pointerdown', () => {
      clearTimeout(tipTimer);
      tip.classList.remove('show');
    });
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => this.applySettings());
  }

  private bindStage() {
    const stage = this.stage;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
    };

    stage.addEventListener(
      'wheel',
      (e) => {
        if (this.index < 0 || this.broken) return;
        e.preventDefault();
        const pinch = e.ctrlKey;
        const trackpadPan = !pinch && this.backend.platform === 'mac';
        if (trackpadPan) {
          this.setView({ ...this.view, x: this.view.x - e.deltaX, y: this.view.y - e.deltaY, mode: 'free' });
          return;
        }
        const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        const factor = Math.exp(-delta * (pinch ? 0.01 : 0.0018));
        this.setView(zoomAt(this.view, factor, local(e)));
      },
      { passive: false },
    );

    let drag: { id: number; x: number; y: number; vx: number; vy: number; pan: boolean; moved: boolean } | null = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.index < 0) return;
      const pan = canPan(this.view, this.natural, this.stageSize());
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, pan, moved: false };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.pan) this.setView({ ...this.view, x: drag.vx + dx, y: drag.vy + dy, mode: 'free' });
      else this.slot.slide.style.setProperty('--swipe', `${dx * 0.35}px`);
    });
    const end = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && this.loupe.active) {
        const hex = this.loupe.currentHex();
        if (hex) void this.panels.copyText(hex, `Copied ${hex}`);
      }
      if (!drag.pan) {
        this.slot.slide.style.setProperty('--swipe', '0px');
        if (Math.abs(dx) > 70 && this.items.length > 1) void this.go(dx < 0 ? 1 : -1);
      }
      drag = null;
      stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    stage.addEventListener('dblclick', (e) => {
      if (this.index < 0 || this.broken) return;
      if (this.view.mode === 'fit') {
        const target = this.view.scale >= 1 ? Math.min(this.view.scale * 2.5, 64) : 1;
        this.setView(zoomAt(this.view, target / this.view.scale, local(e)), true);
      } else this.fit();
    });

    stage.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.index >= 0) this.panels.openContextMenu(e.clientX, e.clientY);
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (this.panels.handleKey(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (k === 'Alt') {
        e.preventDefault();
        this.loupe.hold(true);
        return;
      }
      if (mod && k.toLowerCase() === 'o') return void (e.preventDefault(), this.openDialog());
      if (mod && k.toLowerCase() === 'c') return void (e.preventDefault(), this.panels.copyImage());
      if (mod && (k === '=' || k === '+')) return void (e.preventDefault(), this.zoomStep(1));
      if (mod && k === '-') return void (e.preventDefault(), this.zoomStep(-1));
      if (mod && k === '0') return void (e.preventDefault(), this.fit());
      if (mod && k.toLowerCase() === 'w') return void (e.preventDefault(), this.backend.close());
      if (mod) return;
      switch (k) {
        case 'ArrowRight': case 'PageDown': return void (e.preventDefault(), this.go(1));
        case 'ArrowLeft': case 'PageUp': return void (e.preventDefault(), this.go(-1));
        case 'Home': return void this.goTo(0);
        case 'End': return void this.goTo(this.items.length - 1);
        case ' ': e.preventDefault(); return this.items.length > 1 ? this.togglePlay() : undefined;
        case '+': case '=': return this.zoomStep(1);
        case '-': case '_': return this.zoomStep(-1);
        case '0': return this.fit();
        case '1': return this.actualSize();
        case 'Enter': case 'F11': e.preventDefault(); return void this.toggleFullscreen();
        case 'Escape':
          if (this.fullscreen) return void this.toggleFullscreen(false);
          if (this.slideshow.playing) return this.slideshow.pause();
          if (this.view.mode === 'free') return this.fit();
          return;
        case '?': return this.panels.openHelp();
      }
      switch (k.toLowerCase()) {
        case 'o': return void this.openDialog();
        case 'i': return this.panels.toggleInfo();
        case 'p': return this.panels.togglePalette();
        case 'g': return this.panels.toggleSheet();
        case 'a': return this.run('ambient');
        case 'b': return this.cycleBackdrop();
        case 'r': return this.rotate(e.shiftKey ? -90 : 90);
        case 'f': return this.flip();
        case 'l': return this.loupe.toggle();
        case 's': return this.togglePlay();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') {
        e.preventDefault();
        this.loupe.hold(false);
      }
    });
    window.addEventListener('blur', () => this.loupe.hold(false));
  }

  private bindHud() {
    const wake = () => {
      this.root.classList.add('hud-on');
      clearTimeout(this.hudTimer);
      this.hudTimer = window.setTimeout(() => {
        // data-pin-hud on <html> keeps the chrome up, for screenshots.
        if (this.hudPinned || this.root.classList.contains('is-empty') || document.documentElement.dataset.pinHud) return;
        this.root.classList.remove('hud-on');
      }, HUD_IDLE_MS);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) wake();
    });
    this.root.querySelectorAll<HTMLElement>('.hud, .panel, .menu').forEach((el) => {
      el.addEventListener('pointerenter', () => (this.hudPinned = true));
      el.addEventListener('pointerleave', () => (this.hudPinned = false));
    });
    document.addEventListener('pointerleave', () => {
      if (!this.hudPinned) this.root.classList.remove('hud-on');
    });
    wake();
  }

  private startClock() {
    let last = performance.now();
    const frame = (now: number) => {
      this.slideshow.tick(now - last);
      last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** The current image as drawn, at its natural size (vectors at their display size). */
  renderToCanvas(maxSide = 16384): HTMLCanvasElement | null {
    if (this.index < 0 || this.broken) return null;
    const img = this.slot.img;
    let { w, h } = this.natural;
    if (img.classList.contains('is-vector')) {
      w = Math.round(w * Math.max(1, this.view.scale));
      h = Math.round(h * Math.max(1, this.view.scale));
    }
    const k = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * k));
    canvas.height = Math.max(1, Math.round(h * k));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
}
