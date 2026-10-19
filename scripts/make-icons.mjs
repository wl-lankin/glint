// Renders the brand SVGs and lets the Tauri CLI build every app icon size from them.
// Run with `npm run icons` after changing assets/logo.svg or assets/file-icon.svg.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const render = (svg, size) =>
  new Resvg(readFileSync(join(root, svg)), { fitTo: { mode: 'width', value: size } }).render().asPng();

const tauri = (args) => execFileSync('npx', ['tauri', ...args], { cwd: root, stdio: 'inherit', shell: true });

const work = mkdtempSync(join(tmpdir(), 'glint-icons-'));
try {
  const logo = join(work, 'logo.png');
  writeFileSync(logo, render('assets/logo.svg', 1024));
  tauri(['icon', logo, '-o', 'src-tauri/icons']);

  // The document icon Explorer shows for images associated with Glint.
  const file = join(work, 'file.png');
  writeFileSync(file, render('assets/file-icon.svg', 1024));
  const fileOut = join(work, 'file-icons');
  tauri(['icon', file, '-o', fileOut]);
  copyFileSync(join(fileOut, 'icon.ico'), join(root, 'src-tauri/icons/file-image.ico'));

  // Brand images for the README and the About dialog.
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs/logo.png'), render('assets/logo.svg', 512));
} finally {
  rmSync(work, { recursive: true, force: true });
}
