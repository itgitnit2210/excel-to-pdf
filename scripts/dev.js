import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await copyFile('client/index.html', 'dist/index.html');
const ctx = await context({ entryPoints: ['client/main.jsx'], bundle: true, sourcemap: true, outfile: 'dist/app.js', define: { 'process.env.NODE_ENV': '"development"' } });
await ctx.watch();
const server = spawn(process.execPath, ['--watch', '--env-file-if-exists=.env', 'server/index.js'], { stdio: 'inherit' });
async function stop() { server.kill(); await ctx.dispose(); process.exit(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
