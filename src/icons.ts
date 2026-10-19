// Line icons drawn for Glint: 24 px grid, 1.6 px round strokes, currentColor.
const svg = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

export const icons = {
  open: svg('<path d="M3.5 7.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2h-6l-2-2.5h-5a2 2 0 0 0-2 2Z"/><path d="M12 10.5v5M9.5 13h5"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2"/><circle cx="12" cy="7.9" r=".6" fill="currentColor"/>'),
  palette: svg('<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.9 1.9-1.9 0-.6-.3-1-.6-1.4-.3-.4-.6-.8-.6-1.3 0-1 .8-1.7 1.8-1.7h2.1a3.9 3.9 0 0 0 3.9-3.9C20.5 6.9 16.7 3.5 12 3.5Z"/><circle cx="7.6" cy="11.4" r="1.1"/><circle cx="10.4" cy="7.6" r="1.1"/><circle cx="15" cy="8" r="1.1"/>'),
  grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>'),
  ambient: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3"/>'),
  image: svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="15.5" cy="9.5" r="1.6"/><path d="m3.8 16.5 4.7-4.7a1.2 1.2 0 0 1 1.7 0l3.3 3.3 1.8-1.8a1.2 1.2 0 0 1 1.7 0l3.2 3.2"/>'),
  code: svg('<path d="m8.5 7.5-4.5 4.5 4.5 4.5M15.5 7.5l4.5 4.5-4.5 4.5M13.5 5l-3 14"/>'),
  more: svg('<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>'),
  prev: svg('<path d="m14.5 6-6 6 6 6"/>'),
  next: svg('<path d="m9.5 6 6 6-6 6"/>'),
  play: svg('<path d="M8.5 6.3v11.4a.8.8 0 0 0 1.2.7l9-5.7a.8.8 0 0 0 0-1.4l-9-5.7a.8.8 0 0 0-1.2.7Z" fill="currentColor" stroke="none"/>'),
  pause: svg('<rect x="7" y="6" width="3.4" height="12" rx="1" fill="currentColor" stroke="none"/><rect x="13.6" y="6" width="3.4" height="12" rx="1" fill="currentColor" stroke="none"/>'),
  zoomIn: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3M11 8.3v5.4M8.3 11h5.4"/>'),
  zoomOut: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3M8.3 11h5.4"/>'),
  rotate: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4.2h-4.2"/>'),
  flip: svg('<path d="M12 3.5v17"/><path d="M8.5 7 4 17h4.5Z"/><path d="M15.5 7 20 17h-4.5Z" stroke-dasharray="2 2.2"/>'),
  backdrop: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 12h16M12 4v16" opacity=".35"/><path d="M4.6 4.6 12 12M12 12l7.4 7.4" opacity="0"/><rect x="4" y="4" width="8" height="8" rx="0" fill="currentColor" opacity=".35" stroke="none"/><rect x="12" y="12" width="8" height="8" fill="currentColor" opacity=".35" stroke="none"/>'),
  fullscreen: svg('<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>'),
  fullscreenExit: svg('<path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20"/>'),
  copy: svg('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>'),
  reveal: svg('<path d="M3.5 7.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2h-6l-2-2.5h-5a2 2 0 0 0-2 2Z"/><path d="m11 13.5 2.2 2.2L16.5 12"/>'),
  path: svg('<path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 12.6 5a3.9 3.9 0 0 1 5.5 5.5L16.5 12M13 17.5 11.4 19a3.9 3.9 0 0 1-5.5-5.5L7.5 12"/>'),
  keyboard: svg('<rect x="3" y="6" width="18" height="12" rx="2.4"/><path d="M7 10h.01M10.3 10h.01M13.7 10h.01M17 10h.01M7 14h.01M17 14h.01M10 14h4"/>'),
  external: svg('<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>'),
  github: svg('<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  winMin: '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M1.5 6h9" stroke="currentColor" stroke-width="1"/></svg>',
  winMax: '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="1.6" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  winRestore: '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="1.5" y="3.5" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" stroke-width="1"/><path d="M3.5 3.5V2.8c0-.7.6-1.3 1.3-1.3h4.4c.7 0 1.3.6 1.3 1.3v4.4c0 .7-.6 1.3-1.3 1.3h-.7" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  winClose: '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1"/></svg>',
  broken: svg('<path d="M4 15.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6.5"/><path d="m4 15.5 4.5-4.5 3 3"/><path d="M20 16.5 16.5 20M16.5 16.5 20 20"/><circle cx="15.5" cy="8.5" r="1.4"/>', ' stroke-width="1.3"'),
  loupe: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/><path d="M8 10.5h5M10.5 8v5" opacity=".5"/>'),
} as const;

export type IconName = keyof typeof icons;
