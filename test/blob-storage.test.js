import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { authorizeUpload, prepareUpload, readJob, signJob, jobPaths, downloadInput, storePdf, deleteJob, cleanExpired } from '../server/blob-storage.js';

process.env.UPLOAD_ACCESS_KEY = 'test-only-access-key-with-at-least-32-characters';

test('private upload requires access code and issues a bounded, exact-path upload', async () => {
  assert.throws(() => authorizeUpload({ get: () => 'wrong' }), /access code/);
  authorizeUpload({ get: () => process.env.UPLOAD_ACCESS_KEY });
  const calls = [];
  const sdk = {
    issueSignedToken: async options => { calls.push(options); return {}; },
    presignUrl: async (token, options) => { calls.push(options); return { presignedUrl: 'https://example.test/upload' }; }
  };
  const prepared = await prepareUpload('protected.xlsx', 9 * 1024 * 1024, sdk);
  const job = readJob(prepared.jobToken);
  assert.equal(calls[0].pathname, jobPaths(job).input);
  assert.deepEqual(calls[0].operations, ['put']);
  assert.equal(calls[0].maximumSizeInBytes, 10 * 1024 * 1024);
  assert.equal(calls[1].access, 'private');
  assert.equal(calls[1].allowOverwrite, false);
  await assert.rejects(prepareUpload('big.xlsx', 11 * 1024 * 1024, sdk), /up to/);
  assert.throws(() => readJob(prepared.jobToken + 'x'), /Invalid/);
  assert.throws(() => readJob(signJob({ ...job, expires: 0 })), /expired/);
});

test('9 MB private transfer preserves all bytes and stops oversized streams', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'blob-test-'));
  try {
    const job = { id: '12345678-1234-1234-1234-123456789abc', ext: '.xlsx' };
    const bytes = randomBytes(9 * 1024 * 1024);
    const sdk = { get: async () => ({ statusCode: 200, stream: new Blob([bytes]).stream() }) };
    const file = path.join(dir, 'input');
    await downloadInput(job, file, sdk);
    assert.deepEqual(await readFile(file), bytes);
    await assert.rejects(downloadInput(job, path.join(dir, 'too-large'), { get: async () => ({ statusCode: 200, stream: new Blob([Buffer.alloc(11 * 1024 * 1024)]).stream() }) }), /size limit/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('large PDFs stay private, signed links are scoped, cleanup deletes only job files', async () => {
  const job = { id: '12345678-1234-1234-1234-123456789abc', ext: '.xlsx' };
  const paths = jobPaths(job), calls = [];
  const sdk = {
    put: async (name, bytes, options) => { assert.equal(bytes.length, 6 * 1024 * 1024); assert.equal(name, paths.output); assert.equal(options.access, 'private'); },
    issueSignedToken: async options => { assert.deepEqual(options.operations, ['get']); assert.equal(options.pathname, paths.output); return {}; },
    presignUrl: async (token, options) => { assert.equal(options.access, 'private'); return { presignedUrl: 'https://example.test/pdf' }; },
    del: async values => calls.push(values)
  };
  assert.equal(await storePdf(job, Buffer.alloc(6 * 1024 * 1024), sdk), 'https://example.test/pdf');
  await deleteJob(job, false, sdk); await deleteJob(job, true, sdk);
  assert.deepEqual(calls, [paths.input, [paths.input, paths.output]]);
  const deleted = [];
  assert.equal(await cleanExpired({
    list: async options => {
      assert.equal(options.prefix, 'excel-pdf-jobs/');
      return { blobs: [{ pathname: 'old', uploadedAt: new Date(0) }, { pathname: 'fresh', uploadedAt: new Date() }], hasMore: false };
    }, del: async names => deleted.push(...names)
  }), 1);
  assert.deepEqual(deleted, ['old']);
});
