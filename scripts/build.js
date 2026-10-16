import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['client/main.jsx'], bundle: true, minify: true, sourcemap: true, outfile: 'dist/app.js', define: { 'process.env.NODE_ENV': '"production"' } });
await copyFile('client/index.html', 'dist/index.html');
