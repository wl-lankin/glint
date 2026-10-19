// The SVG source panel: CodeMirror with XML highlighting, a live preview on every edit, save back
// to the file (Ctrl/Cmd+S) and revert. Loaded on first use, so it costs nothing at startup.
import { indentWithTab } from '@codemirror/commands';
import { xml } from '@codemirror/lang-xml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import type { App } from './app';
import { t } from './i18n';
import { icons } from './icons';
import { baseName } from './util';

const PREVIEW_DELAY_MS = 120;

const glintTheme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text)', backgroundColor: 'transparent', fontSize: '12.5px' },
  '.cm-scroller': { fontFamily: '"Cascadia Code", "SF Mono", "JetBrains Mono", Consolas, monospace', lineHeight: '1.6' },
  '.cm-content': { caretColor: '#ff6aa6', padding: '10px 0' },
  '.cm-cursor': { borderLeftColor: '#ff6aa6', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--faint)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--muted)' },
  '.cm-activeLine': { backgroundColor: 'var(--hover)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(139, 123, 255, 0.35) !important' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(70, 227, 255, 0.18)', outline: 'none' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--hover)', border: 'none', color: 'var(--muted)' },
  '.cm-tooltip': { backgroundColor: 'var(--glass-strong)', border: '1px solid var(--line)', borderRadius: '10px', backdropFilter: 'blur(20px)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'rgba(139, 123, 255, 0.35)', color: 'var(--text)' },
  '.cm-panels': { backgroundColor: 'var(--glass-strong)', color: 'var(--text)' },
  '&.cm-focused': { outline: 'none' },
});

const glintHighlight = HighlightStyle.define([
  { tag: [tags.tagName, tags.angleBracket], color: 'var(--syn-tag)' },
  { tag: tags.attributeName, color: 'var(--syn-attr)' },
  { tag: tags.attributeValue, color: 'var(--syn-value)' },
  { tag: [tags.comment, tags.processingInstruction, tags.documentMeta], color: 'var(--faint)', fontStyle: 'italic' },
  { tag: [tags.content, tags.string], color: 'var(--text)' },
  { tag: tags.invalid, color: '#ff5c78' },
]);

/** The first line of the parser's complaint, or null when the text is a well-formed SVG. */
export function svgError(text: string): string | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const error = doc.querySelector('parsererror');
  if (error) {
    // Chromium wraps the message in a heading and a <div>; WebKit and Firefox put it in plain text.
    const text = error.querySelector('div')?.textContent ?? error.textContent ?? '';
    const message = text.split('\n').map((l) => l.trim()).find((l) => /line|error|zeile/i.test(l));
    return message ?? 'XML error';
  }
  if (doc.documentElement.localName !== 'svg') return '<svg> root element missing';
  return null;
}

export class SvgEditor {
  readonly panel: HTMLElement;
  private readonly host: HTMLElement;
  private readonly status: HTMLElement;
  private readonly error: HTMLElement;
  private view: EditorView | null = null;
  private path = '';
  private original = '';
  /** Unsaved edits per file, kept while the user looks at other images. */
  private readonly drafts = new Map<string, string>();
  private timer = 0;
  private loadToken = 0;

  constructor(private readonly app: App) {
    this.panel = app.root.querySelector<HTMLElement>('.code-panel')!;
    this.panel.innerHTML = `
      <div class="code-head">
        <div class="code-title"><span class="code-label"></span><span class="code-file"></span></div>
        <span class="code-status"></span>
        <button class="ghost-btn code-revert" data-code="revert"></button>
        <button class="code-save" data-code="save"></button>
        <button class="icon-btn" data-code="close">${icons.close}</button>
      </div>
      <div class="code-host"></div>
      <div class="code-error" hidden></div>`;
    this.host = this.panel.querySelector('.code-host')!;
    this.status = this.panel.querySelector('.code-status')!;
    this.error = this.panel.querySelector('.code-error')!;
    this.panel.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-code]')?.dataset.code;
      if (action === 'save') void this.save();
      else if (action === 'revert') this.revert();
      else if (action === 'close') this.app.toggleEditor(false);
    });
    this.relocalize();
  }

  relocalize() {
    const set = (selector: string, text: string) => (this.panel.querySelector(selector)!.textContent = text);
    set('.code-label', t('code.title'));
    set('.code-revert', t('code.revert'));
    set('.code-save', t('code.save'));
    this.panel.querySelector('[data-code="close"]')!.setAttribute('aria-label', t('win.close'));
    this.renderStatus();
  }

  get dirty(): boolean {
    return !!this.view && this.view.state.doc.toString() !== this.original;
  }

  /** Shows the source of `path`; keeps unsaved edits of the previous file as a draft. */
  async load(path: string) {
    if (path === this.path && this.view) return;
    this.stash();
    const token = ++this.loadToken;
    this.path = path;
    this.panel.querySelector('.code-file')!.textContent = baseName(path);
    let source: string;
    try {
      source = await (await fetch(this.app.backend.url(path))).text();
    } catch {
      source = '';
    }
    if (token !== this.loadToken) return;
    this.original = source;
    const draft = this.drafts.get(path);
    this.drafts.delete(path);
    this.setDoc(draft ?? source);
    if (draft !== undefined) this.onEdit(true);
    this.renderStatus();
  }

  /** Called when the panel closes or another image is shown. */
  stash() {
    if (this.path && this.dirty) {
      this.drafts.set(this.path, this.view!.state.doc.toString());
      this.app.panels.toast(t('code.draftKept', { name: baseName(this.path) }));
    }
  }

  focus() {
    this.view?.focus();
  }

  private setDoc(text: string) {
    const state = EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        xml(),
        glintTheme,
        syntaxHighlighting(glintHighlight),
        EditorView.lineWrapping,
        keymap.of([
          indentWithTab,
          { key: 'Mod-s', preventDefault: true, run: () => (void this.save(), true) },
          { key: 'Escape', run: () => (this.app.toggleEditor(false), true) },
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) this.onEdit(false);
        }),
      ],
    });
    if (this.view) this.view.setState(state);
    else this.view = new EditorView({ state, parent: this.host });
    this.error.hidden = true;
  }

  private onEdit(immediate: boolean) {
    this.renderStatus();
    clearTimeout(this.timer);
    const run = () => {
      const text = this.view!.state.doc.toString();
      const problem = svgError(text);
      this.error.hidden = !problem;
      if (problem) {
        this.error.textContent = t('code.invalid', { message: problem });
        return;
      }
      void this.app.previewSvg(text);
    };
    if (immediate) run();
    else this.timer = window.setTimeout(run, PREVIEW_DELAY_MS);
  }

  private renderStatus() {
    const dirty = this.dirty;
    this.status.textContent = dirty ? t('code.unsaved') : '';
    this.panel.classList.toggle('is-dirty', dirty);
  }

  async save() {
    if (!this.view || !this.path) return;
    const text = this.view.state.doc.toString();
    try {
      await this.app.backend.saveSvg(this.path, text);
      this.original = text;
      this.app.backend.invalidate(this.path);
      this.renderStatus();
      this.app.panels.toast(t('code.saved', { name: baseName(this.path) }));
    } catch (error) {
      this.app.panels.toast(t('code.saveFailed', { message: String(error) }));
    }
  }

  revert() {
    if (!this.view) return;
    this.setDoc(this.original);
    this.renderStatus();
    void this.app.previewSvg(this.original);
  }
}
