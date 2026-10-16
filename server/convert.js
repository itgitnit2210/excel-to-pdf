import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { pdfFilter, visibleSheetPages } from './pdf-pages.js';
import { soffice, timeoutMs } from './config.js';
export function run(executable, args, timeout = timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false;
    const collect = chunk => { output = (output + chunk.toString()).slice(-16000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => child.kill());
      else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
    }, timeout);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('Conversion timed out after 120 seconds. Try a smaller workbook.'));
      else if (code !== 0) reject(new Error(`LibreOffice exited with code ${code}. The workbook may be corrupt or unsupported.`));
      else resolve(output.trim());
    });
  });
}
export async function engineHealth() {
  try { return { available: true, version: await run(soffice, ['--headless', '--version'], 10000) }; }
  catch { return { available: false, message: 'LibreOffice is unavailable. Install it or set LIBREOFFICE_PATH in .env, then restart.' }; }
}
export async function convert(file, directory, mode = 'original', sheets = []) {
  const filter = pdfFilter(mode);
  const profile = path.join(directory, 'profile');
  await mkdir(path.join(profile, 'user'), { recursive: true });
  await writeFile(path.join(profile, 'user', 'registrymodifications.xcu'), `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
</oor:items>`);
  await run(soffice, [`-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--nologo', '--nodefault', '--norestore', '--convert-to', filter, '--outdir', directory, file]);
  const pdf = await readFile(path.join(directory, 'workbook.pdf')).catch(() => { throw new Error('LibreOffice did not produce a PDF. Check password protection, print areas, and workbook compatibility.'); });
  if (pdf.length < 5 || pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('The conversion output is not a valid PDF.');
  return mode === 'whole-sheet' ? visibleSheetPages(pdf, sheets) : pdf;
}
