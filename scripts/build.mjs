// Compile la page de l'éditeur dans dist/ (JavaScript regroupé + HTML + CSS + icône).
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('src/renderer/index.html', 'dist/index.html');
await cp('src/renderer/style.css', 'dist/style.css');
await cp('build/icon.png', 'dist/icon.png');

await build({
  entryPoints: ['src/renderer/js/main.js'],
  outfile: 'dist/renderer.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
});
