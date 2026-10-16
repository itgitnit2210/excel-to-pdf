import { parentPort, workerData } from 'node:worker_threads';
import { readFile, writeFile } from 'node:fs/promises';
import officeCrypto from 'officecrypto-tool';
try {
  const input = await readFile(workerData.file);
  const isCompoundFile = input.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';
  const encrypted = isCompoundFile && officeCrypto.isEncrypted(input);
  if (!encrypted) parentPort.postMessage({ encrypted: false });
  else if (!workerData.password) parentPort.postMessage({ code: 'PASSWORD_REQUIRED', error: 'This workbook needs a password to open. Enter its password and convert again.' });
  else {
    try {
      const output = await officeCrypto.decrypt(input, { password: workerData.password });
      if (output.length > 25 * 1024 * 1024) throw new Error('size');
      await writeFile(workerData.file, output, { mode: 0o600 });
      parentPort.postMessage({ encrypted: true });
    } catch {
      parentPort.postMessage({ code: 'PASSWORD_FAILED', error: 'Could not unlock the workbook. Check the password. Unsupported encryption or a damaged file can also cause this error.' });
    }
  }
} catch {
  parentPort.postMessage({ code: 'INVALID_WORKBOOK', error: 'Cannot read this workbook. It may be damaged or use unsupported encryption.' });
} finally { workerData.password = ''; }
