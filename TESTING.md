# Validation — v1.1

`npm run build` passed. All 10 tests passed on Linux / Node.js 24.

Verified:
- Extension and file-signature validation; XLSX sheet/print-area/chart preflight.
- Process errors and timeout termination.
- Office Agile and Standard password encryption: missing password, wrong password, correct password, unchanged encrypted file after failure, and byte-for-byte recovery of the original workbook after successful decryption.
- Original vs whole-sheet export filter selection.
- Hidden PDF pages excluded by copying visible pages to a fresh document, preserving visible page sizes/order.
- Uncertain page-to-sheet mapping rejected.
- HTTP multipart encrypted workbook upload with mode/password fields, real decryption, metadata response, visible-page filtering and job cleanup.

The HTTP integration test uses a stub executable that returns a valid two-page PDF. It tests application plumbing, not LibreOffice rendering fidelity. Encryption test files are generated with officecrypto-tool; independent Excel-produced encrypted files and legacy XLS encryption have not been tested.

LibreOffice could not be installed in this preparation environment. Real XLSX-to-PDF conversion, Docker image build, native macOS/Windows operation and visual browser QA remain unverified. Arabic text direction differences shown in the screenshots remain unverified because the source workbook/fonts were not provided.

## First check in Codespaces

1. Stop the old Node server and replace project files, keeping `.env`.
2. Run `npm ci`, `npm run build`, then `npm start`.
3. Refresh the private port 3000 browser tab.
4. Upload `examples/formatting-sample.xlsx` and choose Whole sheet on one page.
5. Check that the visible sales sheet is a single page with all columns and chart. The hidden sheet must not appear.
6. Test a copy of your actual workbook, then its password-encrypted version with the correct password.
7. Compare both with Excel's own output. Check all columns, objects, formulas, Arabic direction and font substitution.

Legacy .xls whole-sheet mode requires saving to .xlsx first; Original mode remains available. Password support depends on the encryption scheme. The downloaded PDF is not password-protected.
