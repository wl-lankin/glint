import { defineConfig } from 'vite';

// The live demo for the website: the normal interface plus dev/landing.ts, built with relative
// paths so it runs from any folder. The demo images are not part of the build; the website puts
// them next to it in demo/.
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [
    {
      name: 'landing',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) =>
          html
            .replace('<head>', '<head>\n    <meta name="robots" content="noindex" />')
            .replace('src="/src/main.ts"', 'src="/dev/landing.ts"'),
      },
    },
  ],
  build: { target: 'es2022', outDir: 'dist-landing', emptyOutDir: true, assetsInlineLimit: 0 },
});
