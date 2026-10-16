import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 10);

if (!Number.isFinite(maxUploadMb) || maxUploadMb <= 0) {
  throw new Error('MAX_UPLOAD_MB must be a positive number.');
}

export const maxBytes = Math.floor(maxUploadMb * 1024 * 1024);
export const timeoutMs = 120000;

export const soffice =
  process.env.LIBREOFFICE_PATH ||
  (process.platform === 'darwin'
    ? '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    : process.platform === 'win32'
      ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
      : 'libreoffice');