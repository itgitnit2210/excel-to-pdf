import express from 'express';
import multer from 'multer';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { root, maxBytes } from './config.js';
import { inspectWorkbook, fileExtension } from './inspect.js';
import { unlockWorkbook } from './unlock.js';
import { pdfFilter } from './pdf-pages.js';
import { convert, engineHealth } from './convert.js';
import { blobMode, authorizeUpload, prepareUpload, readJob, downloadInput, storePdf, deleteJob, cleanExpired, equalSecret } from './blob-storage.js';
const app = express();
app.use(express.json({ limit: '8kb' }));
app.disable('x-powered-by');
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
const upload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, req.workDir), filename: (req, file, cb) => cb(null, 'upload') }), limits: { fileSize: maxBytes, files: 1, fields: 2, parts: 3, fieldSize: 2048 } }).single('file');
let busy = false;
let health = await engineHealth();
app.get('/api/health', (req, res) => res.json({ ...health, busy, maxUploadMB: !blobMode && process.env.VERCEL ? Math.min(4, maxBytes / 1024 / 1024) : maxBytes / 1024 / 1024, uploadMode: blobMode ? 'blob' : 'direct' }));
app.post('/api/upload/prepare', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!blobMode) return res.status(409).json({ error: 'Private uploads are not enabled.' });
    authorizeUpload(req);
    res.json(await prepareUpload(req.body?.name, req.body?.size));
  } catch (error) { res.status(error.status || 422).json({ error: error.message }); }
});
app.post('/api/upload/cleanup', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!blobMode) return res.sendStatus(404);
    await deleteJob(readJob(req.body?.jobToken));
    res.json({ ok: true });
  } catch (error) { res.status(422).json({ error: error.message }); }
});
app.get('/api/cleanup', async (req, res) => {
  if (!blobMode || !process.env.CRON_SECRET || !equalSecret(req.get('Authorization'), `Bearer ${process.env.CRON_SECRET}`)) return res.sendStatus(401);
  try { res.json({ deleted: await cleanExpired() }); }
  catch { res.status(500).json({ error: 'Storage cleanup failed.' }); }
});
app.post('/api/convert', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!health.available) return res.status(503).json({ error: health.message });
  if (busy) return res.status(429).json({ error: 'Another workbook is being converted. Please try again shortly.' });
  busy = true;
  let job;
  try {
    req.workDir = await mkdtemp(path.join(os.tmpdir(), 'excel-pdf-'));
    if (blobMode) {
      job = readJob(req.body?.jobToken);
      const inputPath = path.join(req.workDir, 'upload');
      await downloadInput(job, inputPath);
      req.file = { path: inputPath, originalname: `workbook${job.ext}` };
    } else {
      await new Promise((resolve, reject) => upload(req, res, error => error ? reject(error) : resolve()));
      if (process.env.VERCEL && req.file?.size > 4 * 1024 * 1024) throw new Error('Enable private storage uploads for files larger than 4 MB.');
    }
    if (!req.file) return res.status(400).json({ error: 'Upload one Excel file using the file field.' });
    const ext = fileExtension(req.file.originalname);
    const mode = req.body.mode || 'original';
    pdfFilter(mode);
    if (Object.keys(req.body).some(key => !['mode', 'password', ...(blobMode ? ['jobToken'] : [])].includes(key))) throw new Error('Unexpected upload field.');
    if (typeof req.body.password !== 'undefined' && typeof req.body.password !== 'string') throw new Error('Enter one password value.');
    if ((req.body.password || '').length > 255) throw new Error('Passwords longer than 255 characters are not supported.');
    if (mode === 'whole-sheet' && ext === '.xls') throw new Error('For whole-sheet export, save legacy .xls as .xlsx in Excel first, or choose Original print settings.');
    const file = path.join(req.workDir, `workbook${ext}`);
    await rename(req.file.path, file);
    await unlockWorkbook(file, req.body.password || '');
    req.body.password = '';
    const report = await inspectWorkbook(file, ext);
    if (mode === 'whole-sheet') {
      report.warnings = report.warnings.filter(w => !w.startsWith('Print areas') && !w.startsWith('Hidden sheets'));
      report.warnings.unshift('Whole-sheet export ignores paper size, print areas and page breaks. Each visible sheet becomes one content-sized PDF page.');
      if (report.sheets.some(s => s.hidden)) report.warnings.push('Hidden sheet pages were excluded from the downloadable PDF.');
    }
    const pdf = await convert(file, req.workDir, mode, report.sheets);
    const summary = { mode, ...report, sheets: report.sheets.slice(0, 50), sheetCount: report.sheets.length };
    if (job) return res.json({ downloadUrl: await storePdf(job, pdf), report: summary });
    if (process.env.VERCEL && pdf.length > 4 * 1024 * 1024) throw new Error('Enable private storage downloads for PDFs larger than 4 MB.');
    res.setHeader('X-Workbook-Report', Buffer.from(JSON.stringify(summary)).toString('base64'));
    res.type('application/pdf').setHeader('Content-Disposition', 'inline; filename="converted.pdf"');
    res.send(pdf);
  } catch (error) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error instanceof multer.MulterError ? 400 : 422;
    if (!res.headersSent && !res.destroyed) res.status(status).json({ code: error.code || 'CONVERSION_FAILED', error: error.code === 'LIMIT_FILE_SIZE' ? `The file exceeds the ${maxBytes / 1024 / 1024} MB upload limit.` : error.message });
  } finally {
    if (job) await deleteJob(job, false).catch(() => console.error('Storage input cleanup failed; scheduled cleanup will retry.'));
    if (req.body) req.body.password = '';
    if (req.workDir) await rm(req.workDir, { recursive: true, force: true }).catch(error => console.error('Temporary cleanup failed:', error.message));
    busy = false;
  }
});
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(express.static(path.join(root, 'dist')));
app.get('/', (req, res) => res.sendFile(path.join(root, 'dist/index.html')));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => console.log(`Excel to PDF: http://${host}:${server.address().port}\n${health.available ? health.version : health.message}`));
