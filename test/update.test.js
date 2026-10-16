import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import officeCrypto from 'officecrypto-tool';
import { PDFDocument } from 'pdf-lib';
import { unlockWorkbook } from '../server/unlock.js';
import { pdfFilter, visibleSheetPages } from '../server/pdf-pages.js';
for (const type of ['agile', 'standard']) {
  test(`password-to-open: ${type} encryption, missing/wrong/correct password and exact byte recovery`, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'unlock-test-'));
    try {
      const original = await readFile(new URL('../examples/formatting-sample.xlsx', import.meta.url));
      const options = { password: ' Test-password-123! ' };
      if (type === 'standard') options.type = 'standard';
      const encrypted = await officeCrypto.encrypt(original, options);
      const file = path.join(dir, 'protected.xlsx'); await writeFile(file, encrypted);
      await assert.rejects(unlockWorkbook(file), error => error.code === 'PASSWORD_REQUIRED');
      await assert.rejects(unlockWorkbook(file, 'wrong'), error => error.code === 'PASSWORD_FAILED');
      assert.ok((await readFile(file)).equals(encrypted));
      assert.equal((await unlockWorkbook(file, options.password)).encrypted, true);
      assert.ok((await readFile(file)).equals(original));
      assert.equal((await unlockWorkbook(file)).encrypted, false);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
test('whole sheet filter is explicit and original mode remains unchanged', () => {
  assert.match(pdfFilter('whole-sheet'), /SinglePageSheets/);
  assert.equal(pdfFilter('original'), 'pdf:calc_pdf_Export');
  assert.throws(() => pdfFilter('unexpected'));
});
test('whole-sheet output copies only visible pages and fails on uncertain mapping', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 300]); pdf.addPage([100, 100]); pdf.addPage([800, 400]);
  const bytes = await pdf.save();
  const result = await visibleSheetPages(bytes, [{ hidden: false }, { hidden: true }, { hidden: false }]);
  const output = await PDFDocument.load(result);
  assert.equal(output.getPageCount(), 2);
  assert.equal(output.getPage(0).getWidth(), 600);
  assert.equal(output.getPage(1).getWidth(), 800);
  await assert.rejects(visibleSheetPages(bytes, [{ hidden: false }]), /safely map/);
});
