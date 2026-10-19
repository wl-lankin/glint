// The live demo on the website: the real interface with the browser backend, embedded in an
// iframe. It tells the page which image glows, so the ambient light can spill past the window,
// hands plain wheel scrolling back to the page and accepts images the visitor drops on the page.
import './landing.css';

const toParent = (message: Record<string, unknown>) => parent.postMessage({ glint: true, ...message }, location.origin);

// A plain wheel scrolls the page; pinch and Ctrl or Cmd plus wheel still zoom the image.
addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey || e.metaKey) return;
    e.stopPropagation();
    e.preventDefault();
    toParent({ event: 'wheel', dy: e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY });
  },
  { capture: true, passive: false },
);

// Files dropped anywhere on the page arrive as a drop on this window.
addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data?.glint || e.data.event !== 'files') return;
  const transfer = new DataTransfer();
  for (const file of e.data.files as File[]) transfer.items.add(file);
  dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, cancelable: true }));
});

await import('../src/main');

const glows = [...document.querySelectorAll<HTMLElement>('.ambient .glow')];
let last = '';
const report = () => {
  const active = glows.find((g) => g.classList.contains('active'));
  const raw = active?.style.backgroundImage.match(/url\("?(.*?)"?\)$/)?.[1] ?? '';
  const url = raw ? new URL(raw, location.href).href : '';
  if (url === last) return;
  last = url;
  toParent({ event: 'glow', url });
};
const watch = new MutationObserver(report);
glows.forEach((g) => watch.observe(g, { attributes: true, attributeFilter: ['class', 'style'] }));
report();
toParent({ event: 'ready' });
