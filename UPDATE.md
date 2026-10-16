# Update your existing Codespace

This ZIP is the complete v1.1 project, including unchanged files.

1. Stop the current server with Ctrl+C.
2. Replace the project files with the contents of this ZIP's `excel-to-pdf` folder. Put package.json in the same directory as before. Keep your existing `.env`.
3. Check `.env`:

```env
HOST=0.0.0.0
PORT=3000
LIBREOFFICE_PATH=/usr/bin/libreoffice
```

4. In that project directory:

```bash
npm ci
npm run build
npm start
```

5. Refresh your forwarded port 3000 tab. Keep port visibility Private.
6. Choose **Whole sheet on one page**. Enter the Excel opening password if needed, then convert.

## Changes

- Whole-sheet mode is the UI default for XLSX/XLSM. One content-sized page per visible sheet, with no horizontal paper-page splitting. Original print settings remain available.
- Password-to-open field and package-level decryption using the supplied password; no cell-style reconstruction.
- Wrong/missing password handling; password cleared from UI after submission and omitted from logs/command arguments.
- Hidden sheet pages excluded from whole-sheet PDFs; mismatched page mapping returns an error rather than an uncertain PDF.
- Existing upload size limits, isolated profiles, timeout and cleanup retained.
- Dependencies and lockfile updated; installation is required before restarting.

Limitations: whole-sheet mode ignores print areas and page settings; it does not repair text clipping or font/RTL differences. Legacy XLS requires Original mode or saving as XLSX first. Unsupported encryption is reported; no password recovery is attempted. PDFs have no password.

Real LibreOffice rendering could not be tested in the preparation environment. See TESTING.md for exactly what was verified.
