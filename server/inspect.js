import { open as openFile } from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';
import { XMLParser } from 'fast-xml-parser';
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
export function fileExtension(name) {
  const ext = path.extname(name).toLowerCase();
  if (!['.xlsx', '.xlsm', '.xls'].includes(ext)) throw new Error('Choose an .xlsx, .xlsm, or .xls workbook.');
  return ext;
}
export async function inspectWorkbook(file, ext) {
  const handle = await openFile(file, 'r');
  const header = Buffer.alloc(8);
  try { await handle.read(header, 0, 8, 0); } finally { await handle.close(); }
  if (ext === '.xls') {
    if (header.toString('hex') !== 'd0cf11e0a1b11ae1') throw new Error('The file is not a supported binary Excel workbook.');
    return { sheets: [], warnings: ['Legacy .xls file: sheet and print-area preflight is unavailable. Review the PDF carefully.'] };
  }
  if (header.readUInt32LE(0) !== 0x04034b50) throw new Error('The workbook is invalid or encrypted. Save an unencrypted Excel copy first.');
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err) return reject(new Error('The Excel ZIP structure is invalid.'));
      let expanded = 0, entries = 0, workbook = '', hasTypes = false, external = false, charts = false, settled = false;
      function fail(error) { if (!settled) { settled = true; zip.close(); reject(error); } }
      zip.on('error', fail);
      zip.on('entry', entry => {
        expanded += entry.uncompressedSize;
        if (++entries > 20000 || expanded > 200 * 1024 * 1024) return fail(new Error('Workbook exceeds the expanded-size safety limit (200 MB / 20,000 entries).'));
        if (entry.generalPurposeBitFlag & 1) return fail(new Error('Encrypted workbooks are not supported.'));
        hasTypes ||= entry.fileName === '[Content_Types].xml';
        external ||= entry.fileName.startsWith('xl/externalLinks/');
        charts ||= entry.fileName.startsWith('xl/charts/');
        if (entry.fileName !== 'xl/workbook.xml') return zip.readEntry();
        if (entry.uncompressedSize > 2 * 1024 * 1024) return fail(new Error('Workbook metadata is too large.'));
        zip.openReadStream(entry, (error, stream) => {
          if (error) return fail(error);
          const chunks = []; let bytes = 0;
          stream.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > 2 * 1024 * 1024) { stream.destroy(); fail(new Error('Workbook metadata is too large.')); }
            else chunks.push(chunk);
          });
          stream.on('error', fail);
          stream.on('end', () => { if (!settled) { workbook = Buffer.concat(chunks).toString('utf8'); zip.readEntry(); } });
        });
      });
      zip.on('end', () => {
        if (settled) return;
        try {
          if (!hasTypes || !workbook) throw new Error('This file does not contain an Excel workbook.');
          const data = parser.parse(workbook)?.workbook;
          if (!data) throw new Error('Workbook metadata is invalid.');
          const list = data.sheets?.sheet;
          const sheets = (list ? (Array.isArray(list) ? list : [list]) : []).map(s => ({ name: s['@_name'], hidden: ['hidden', 'veryHidden'].includes(s['@_state']) }));
          const warnings = [];
          if (sheets.some(s => s.hidden)) warnings.push('Hidden sheets were detected. Normal workbook print behavior applies; hidden content is not automatically included.');
          if (workbook.includes('_xlnm.Print_Area')) warnings.push('Print areas were detected. Cells outside those areas may be excluded, as configured in Excel.');
          if (external) warnings.push('External workbook links were detected. Linked values may be stale or unavailable; refresh and save in Excel first.');
          if (charts) warnings.push('Charts were detected. Compare their appearance with Excel, particularly newer chart types.');
          if (ext === '.xlsm') warnings.push('Macros are disabled. Macro-generated content must already be saved in the workbook.');
          settled = true; resolve({ sheets, warnings });
        } catch (error) { fail(error); }
      });
      zip.readEntry();
    });
  });
}
