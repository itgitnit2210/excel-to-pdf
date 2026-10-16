import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import officeCrypto from 'officecrypto-tool';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
// A stub engine exercises HTTP plumbing, not LibreOffice rendering fidelity.
test('upload API returns PDF and metadata, rejects invalid files, and cleans temporary jobs', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'excel-api-test-'));
  const engine = path.join(dir, 'engine.cjs');
  const stub = await PDFDocument.create(); stub.addPage([600, 300]); stub.addPage([100, 100]);
  const stubPdf = Buffer.from(await stub.save()).toString('base64');
  await writeFile(engine, `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
if (process.argv.includes('--version')) { console.log('Test engine'); process.exit(); }
const out = process.argv[process.argv.indexOf('--outdir') + 1];
fs.writeFileSync(path.join(out, 'workbook.pdf'), Buffer.from('${stubPdf}', 'base64'));
`);
  await chmod(engine, 0o755);
  const server = spawn(process.execPath, ['server/index.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, LIBREOFFICE_PATH: engine, HOST: '127.0.0.1', PORT: '0', TMPDIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
      server.on('error', error => { clearTimeout(timer); reject(error); });
      server.stdout.on('data', chunk => { const found = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (found) { clearTimeout(timer); resolve(found[0]); } });
    });
    const health = await (await fetch(`${url}/api/health`)).json(); assert.equal(health.available, true);
    const data = new FormData(); data.append('file', new Blob([await readFile(new URL('../examples/formatting-sample.xlsx', import.meta.url))]), 'report.xlsx');
    const response = await fetch(`${url}/api/convert`, { method: 'POST', body: data });
    assert.equal(response.status, 200); assert.match(await response.text(), /^%PDF-/);
    const report = JSON.parse(Buffer.from(response.headers.get('x-workbook-report'), 'base64'));
    assert.equal(report.sheetCount, 2);
    const protectedUpload = new FormData();
    const source = await readFile(new URL('../examples/formatting-sample.xlsx', import.meta.url));
    const encrypted = await officeCrypto.encrypt(source, { password: 'example-password' });
    protectedUpload.append('file', new Blob([encrypted]), 'protected.xlsx');
    protectedUpload.append('mode', 'whole-sheet'); protectedUpload.append('password', 'example-password');
    const unlocked = await fetch(`${url}/api/convert`, { method: 'POST', body: protectedUpload });
    assert.equal(unlocked.status, 200, await unlocked.clone().text());
    assert.equal((await PDFDocument.load(await unlocked.arrayBuffer())).getPageCount(), 1);
    const invalid = new FormData(); invalid.append('file', new Blob(['not a workbook']), 'fake.xlsx');
    const bad = await fetch(`${url}/api/convert`, { method: 'POST', body: invalid });
    assert.equal(bad.status, 422); assert.match((await bad.json()).error, /invalid or encrypted/);
    const { readdir } = await import('node:fs/promises');
    for (let i = 0; i < 20 && (await readdir(dir)).some(n => n.startsWith('excel-pdf-')); i++) await new Promise(r => setTimeout(r, 25));
    assert.equal((await readdir(dir)).some(n => n.startsWith('excel-pdf-')), false);
  } finally { const closed = once(server, 'close'); server.kill(); await closed; await rm(dir, { recursive: true, force: true }); }
});
