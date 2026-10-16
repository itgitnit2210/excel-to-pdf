import { PDFDocument } from 'pdf-lib';
export async function visibleSheetPages(bytes, sheets) {
  const source = await PDFDocument.load(bytes);
  if (!sheets.length || source.getPageCount() !== sheets.length) {
    throw new Error('Cannot safely map the PDF pages to workbook sheets. Try Original print settings, or remove empty sheets from a copy and try again.');
  }
  const indices = sheets.flatMap((sheet, i) => sheet.hidden ? [] : [i]);
  if (!indices.length) throw new Error('This workbook has no visible sheets to export.');
  if (indices.length === sheets.length) return bytes;
  // Copy only visible pages into a new PDF so hidden page content is not retained.
  const output = await PDFDocument.create();
  for (const page of await output.copyPages(source, indices)) output.addPage(page);
  return Buffer.from(await output.save());
}
export function pdfFilter(mode) {
  if (mode === 'original') return 'pdf:calc_pdf_Export';
  if (mode === 'whole-sheet') return 'pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}';
  throw new Error('Choose a valid export mode.');
}
