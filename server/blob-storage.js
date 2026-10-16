import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as blob from '@vercel/blob';
import { fileExtension } from './inspect.js';
import { maxBytes } from './config.js';

export const blobMode = process.env.UPLOAD_MODE === 'blob';
const lifetime = 60 * 60 * 1000;
const prefix = 'excel-pdf-jobs/';

function secret() {
  const value = process.env.UPLOAD_ACCESS_KEY;
  if (!value || value.length < 32) throw new Error('Set UPLOAD_ACCESS_KEY to a random value of at least 32 characters.');
  return value;
}

export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authorizeUpload(req) {
  if (!equalSecret(req.get('X-Upload-Key'), secret())) {
    const error = new Error('Enter the upload access code configured by the app owner.');
    error.status = 401;
    throw error;
  }
}

export function signJob(job) {
  const payload = Buffer.from(JSON.stringify(job)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}

export function readJob(token) {
  if (typeof token !== 'string' || token.length > 2048) throw new Error('Invalid conversion session. Upload the file again.');
  const [payload, signature, extra] = token.split('.');
  const expected = createHmac('sha256', secret()).update(payload || '').digest('base64url');
  if (extra || !equalSecret(signature, expected)) throw new Error('Invalid conversion session. Upload the file again.');
  const job = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (!/^[a-f0-9-]{36}$/.test(job.id) || !['.xlsx', '.xlsm', '.xls'].includes(job.ext) || !Number.isFinite(job.expires) || job.expires < Date.now()) {
    throw new Error('Conversion session expired. Upload the file again.');
  }
  return job;
}

export function jobPaths(job) {
  return { input: `${prefix}${job.id}/input${job.ext}`, output: `${prefix}${job.id}/output.pdf` };
}

export async function prepareUpload(name, size, sdk = blob) {
  const ext = fileExtension(name);
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes) throw new Error(`Choose a file up to ${maxBytes / 1024 / 1024} MB.`);
  const job = { id: randomUUID(), ext, expires: Date.now() + lifetime };
  const pathname = jobPaths(job).input;
  const constraints = { allowedContentTypes: ['application/octet-stream'], maximumSizeInBytes: maxBytes };
  const token = await sdk.issueSignedToken({ pathname, operations: ['put'], validUntil: Date.now() + 10 * 60 * 1000, ...constraints });
  const { presignedUrl } = await sdk.presignUrl(token, { operation: 'put', pathname, access: 'private', addRandomSuffix: false, allowOverwrite: false, ...constraints });
  return { uploadUrl: presignedUrl, jobToken: signJob(job) };
}

export async function downloadInput(job, destination, sdk = blob) {
  const result = await sdk.get(jobPaths(job).input, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) throw new Error('Uploaded file was not found. Upload it again.');
  let size = 0;
  const limit = new Transform({ transform(chunk, encoding, callback) {
    size += chunk.length;
    callback(size > maxBytes ? new Error('Uploaded file exceeds the size limit.') : null, chunk);
  } });
  await pipeline(Readable.fromWeb(result.stream), limit, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
}

export async function storePdf(job, pdf, sdk = blob) {
  const pathname = jobPaths(job).output;
  if (pdf.length > 100 * 1024 * 1024) throw new Error('Generated PDF exceeds the 100 MB output limit.');
  await sdk.put(pathname, pdf, { access: 'private', contentType: 'application/pdf', addRandomSuffix: false, allowOverwrite: true });
  const token = await sdk.issueSignedToken({ pathname, operations: ['get'], validUntil: Date.now() + 10 * 60 * 1000 });
  const { presignedUrl } = await sdk.presignUrl(token, { operation: 'get', pathname, access: 'private', useCache: false });
  return presignedUrl;
}

export async function deleteJob(job, includeOutput = true, sdk = blob) {
  const paths = jobPaths(job);
  await sdk.del(includeOutput ? [paths.input, paths.output] : paths.input);
}

export async function cleanExpired(sdk = blob) {
  let cursor, deleted = 0;
  do {
    const page = await sdk.list({ prefix, cursor, limit: 1000 });
    const expired = page.blobs.filter(item => new Date(item.uploadedAt).getTime() < Date.now() - lifetime).map(item => item.pathname);
    if (expired.length) { await sdk.del(expired); deleted += expired.length; }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}
