import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectWorkbook, fileExtension } from '../server/inspect.js';
import { run } from '../server/convert.js';
test('accepts Excel extensions case-insensitively and rejects other types', () => {
  assert.equal(fileExtension('REPORT.XLSX'), '.xlsx');
  assert.equal(fileExtension('report.xlsm'), '.xlsm');
  assert.throws(() => fileExtension('report.xlsx.exe'));
});
test('rejects disguised and encrypted files before conversion', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'excel-test-'));
  try {
    const file = path.join(dir, 'fake.xlsx'); await writeFile(file, 'not excel');
    await assert.rejects(inspectWorkbook(file, '.xlsx'), /invalid or encrypted/);
    await assert.rejects(inspectWorkbook(file, '.xls'), /binary Excel/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('process runner reports failed executables and exit codes', async () => {
  await assert.rejects(run('does-not-exist-excel-test', []));
  await assert.rejects(run(process.execPath, ['-e', 'process.exit(2)']), /code 2/);
});
test('process timeout terminates stalled conversion', async () => {
  await assert.rejects(run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 100), /timed out/);
});
test('detects sheets, hidden content, print areas and charts without rewriting the workbook', async () => {
  const sample = new URL('../examples/formatting-sample.xlsx', import.meta.url);
  const report = await inspectWorkbook(sample, '.xlsx');
  assert.equal(report.sheets.length, 2);
  assert.equal(report.sheets[1].hidden, true);
  assert.ok(report.warnings.some(w => w.includes('Print areas')));
  assert.ok(report.warnings.some(w => w.includes('Charts')));
});
