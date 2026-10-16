import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const maxBytes = 25 * 1024 * 1024;
export const timeoutMs = 120000;
export const soffice = process.env.LIBREOFFICE_PATH || (process.platform === 'darwin'
  ? '/Applications/LibreOffice.app/Contents/MacOS/soffice'
  : process.platform === 'win32' ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe' : 'libreoffice');
