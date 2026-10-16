# Excel to PDF

A complete JavaScript app: React + Material UI frontend, Express backend, and LibreOffice headless rendering. No Vite, Python, Java, Microsoft Office or paid API is needed to run the app. LibreOffice is a separate, required system installation.

## Quick start on macOS

1. Install Node.js 22 or newer (an LTS release is recommended).
2. Install LibreOffice from https://www.libreoffice.org/download/download-libreoffice/ or run `brew install --cask libreoffice`. Open LibreOffice once if macOS requests application approval, then close it.
3. Unzip this project and open a terminal in `excel-to-pdf`.
4. Run:

```bash
npm ci
npm run build
npm start
```

5. Open http://localhost:3000. Choose an Excel workbook, click **Generate PDF**, review all pages, then download.

Default macOS executable: `/Applications/LibreOffice.app/Contents/MacOS/soffice`.

## Windows

Install Node.js 22+ and LibreOffice. Open PowerShell in the extracted project and run the same three npm commands. The default executable is `C:\Program Files\LibreOffice\program\soffice.exe`. If yours differs, copy `.env.example` to `.env` and set `LIBREOFFICE_PATH` using forward slashes. Restart the server after changing configuration.

## Ubuntu / Debian

```bash
sudo apt-get update
sudo apt-get install libreoffice-calc fonts-liberation fonts-dejavu-core
npm ci
npm run build
npm start
```

Install any fonts used by your workbook on the same machine. Font substitution can change wrapping and pagination.

## Docker alternative

Docker installs LibreOffice inside the image. Put any licensed custom fonts into `fonts/` before building.

```bash
docker build -t excel-to-pdf .
docker run --rm --init -p 127.0.0.1:3000:3000 --memory=1g --cpus=2 --pids-limit=256 excel-to-pdf
```

Open http://localhost:3000. Increase memory for complex workbooks if necessary. The Docker image includes fallback fonts, not Microsoft fonts. On Apple Silicon Docker builds for the native architecture.

## Development

```bash
npm run dev
```

This watches frontend source with esbuild and backend files with Node. Refresh the browser after frontend changes. It does not use Vite. `npm test` runs validation and subprocess tests. `npm run build` creates the production UI in `dist/`.

## What is included

- Responsive upload interface with drag-and-drop and file picker.
- XLSX, XLSM and legacy XLS uploads up to 25 MB.
- Workbook passed to LibreOffice without an ExcelJS/HTML rewrite. Password-encrypted files are decrypted first using the supplied password.
- Default Whole sheet mode exports each visible sheet to one content-sized page. Original mode retains workbook print settings as interpreted by LibreOffice.
- PDF preview and download; download fallback for browsers without inline PDF support.
- XLSX/XLSM preflight reports sheet names, hidden sheets, print areas, charts and external workbook links.
- Private temporary directory and isolated LibreOffice user profile for each conversion.
- Macro execution disabled and spreadsheet link updating disabled in the conversion profile.
- One conversion at a time, 120-second rendering timeout, and bounded OOXML metadata inspection.
- Clear unavailable-engine, invalid-file, oversized-file, busy-server and conversion-failure responses.
- Temporary uploads, profiles and generated files removed in a `finally` block after processing. Browser holds the PDF as an object URL until it is replaced or the tab closes.

The progress indicator is indeterminate because LibreOffice does not provide reliable percent-complete information. Sheet names describe the workbook, not a verified list of sheets included in the PDF. No per-sheet selection is included. Whole-sheet mode uses content-sized pages; original mode uses the workbook paper settings.

## Fidelity and print behavior

This is a high-fidelity best-effort converter, not a guarantee of pixel-identical output. LibreOffice is a different rendering engine from Excel. Validate representative files against PDFs exported directly from Excel.

- Fonts, colors, borders, merged cells, alignment, row heights, column widths, embedded images and supported charts are rendered by LibreOffice. Some advanced features or chart types can differ or fail to render.
- Original mode follows workbook paper size, margins, scaling, page breaks and print areas. Whole-sheet mode ignores these page settings and includes cells outside print areas. Hidden sheets are excluded from whole-sheet downloads by copying visible pages to a fresh PDF; uncertain sheet-to-page mapping fails closed.
- Existing clipping/overlap is not repaired. Automatically changing dimensions would violate layout preservation.
- Formula results may change during recalculation. External data, newer formulas, add-ins and VBA are not guaranteed. Refresh and save the source in Excel first.
- Password-to-open workbooks using supported Office Agile/Standard encryption can be unlocked with the correct password. Unsupported encryption, damaged files and incorrect passwords produce errors. Legacy XLS encryption is best-effort and not covered by the included encryption tests. XLSM macros do not run.
- Preflight warnings do not detect all issues. Font substitution is not reliably reported by this implementation. Review the actual PDF.
- Legacy XLS uses a binary signature check and does not have the detailed OOXML preflight.
- Whole-sheet mode is one page per visible sheet, not one page for the entire workbook. These content-sized pages can be very large and require zooming; it does not auto-fit rows or repair clipping. Legacy XLS requires Original mode, or saving as XLSX first.

## Deployment scope

The default is a local or trusted internal tool, bound to `127.0.0.1`. It has no user accounts and is not a hardened public upload service. Docker is also published to loopback in the example. Uploaded documents are parsed by LibreOffice; macro restrictions alone are not an operating-system sandbox. For untrusted/public use, add authentication, request limits, job isolation with restricted network/filesystem access, a persistent queue, and a reverse proxy with upload and conversion timeouts. Do not expose this app directly to the internet.

A fresh LibreOffice profile prevents interference with an open desktop session. It is not a security boundary. Rendering runs with the server's OS permissions. A container limits exposure but requires additional hardening for hostile uploads. Temporary cleanup runs on normal success/failure, not forced process termination; periodically remove abandoned `excel-pdf-*` directories in the OS temp location when no jobs are running. Do not share source files or credentials in that directory.

One process allows one active conversion. Concurrent requests receive HTTP 429 and can be retried manually. Horizontal scaling needs separate worker isolation and queue coordination. For a reverse proxy, allow requests longer than the 120-second rendering timeout plus upload time.

## Configuration

Copy `.env.example` to `.env` only if you need overrides:

- `PORT`: defaults to `3000`.
- `HOST`: defaults to `127.0.0.1`; use `0.0.0.0` only when intentional.
- `LIBREOFFICE_PATH`: path to the executable itself, without command-line arguments.

Constants in `server/config.js`: 25 MB uploads, 120-second conversion timeout. Expanded XLSX/XLSM size is limited to 200 MB and 20,000 archive entries. Very large PDFs are buffered in memory; this version is designed for moderate workbooks.

## API

`GET /api/health`: reports engine availability, startup version, busy state and upload limit. Restart after installing or changing LibreOffice.

`POST /api/convert`: multipart form with one `file`, optional `password` (maximum 255 characters), and optional `mode` (`whole-sheet` or `original`). Omitted mode defaults to `original` for API compatibility; the UI defaults to `whole-sheet`. Returns PDF bytes on success and JSON `{ "error": "..." }` on failure. `X-Workbook-Report` is base64-encoded UTF-8 JSON containing preflight warnings and up to 50 sheet names. Output PDFs are not retained on a server URL.

## Troubleshooting

- **Engine unavailable:** verify installation and executable path, then restart Node.
- **Unexpected clipping:** compare Excel Print Preview, fonts, fixed row heights, print area and scaling.
- **Missing chart/image:** check whether LibreOffice supports that object; consider a commercial rendering engine for that workbook.
- **Blank/missing pages:** inspect source print areas and hidden content.
- **Timeout:** simplify the workbook or remove excessive formatted blank rows/columns.
- **Port in use:** set another PORT in `.env`.

## Files

`client/`: React UI. `server/`: upload, validation and conversion. `scripts/`: esbuild build/watch commands. `test/`: Node tests. `Dockerfile`: optional containerized setup. `fonts/`: optional Docker fonts.

## Technical references

- https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html
- https://help.libreoffice.org/latest/en-US/text/shared/guide/ms_import_export_limitations.html
- https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html


## v1.1: Codespaces update

Replace project files with this package, preserving your `.env`. Then run:

```bash
npm ci
npm run build
npm start
```

In Codespaces `.env` must use:

```env
HOST=0.0.0.0
PORT=3000
LIBREOFFICE_PATH=/usr/bin/libreoffice
```

If LibreOffice is not installed:

```bash
sudo apt-get update
sudo apt-get install -y libreoffice-calc fonts-liberation fonts-dejavu-core fonts-noto-core
```

Keep forwarded port 3000 Private. Stop the old server before restarting. If using Docker, rebuild the image to include the new dependencies.

### Password handling

Enter the password that opens the Excel workbook into the app, not into a terminal or this README. It is submitted in the request body, cleared from the input on submission, passed to a short-lived worker and never written into arguments, environment variables or application logs. Re-enter it when retrying. The decrypted workbook is briefly stored in the private job directory for LibreOffice, then cleaned up. JavaScript cannot guarantee secure erasure of memory. The downloaded PDF is **not password-protected**; encryption of the PDF is not implemented.

`officecrypto-tool` performs package-level decryption, not spreadsheet reserialization, preserving original workbook bytes for supported encryption. It runs in a worker with a 30-second timeout. Third-party support is not universal, especially for legacy XLS, enterprise rights-managed files and uncommon encryption variants. The UI does not bypass or recover unknown passwords.

### Whole-sheet export

Requires LibreOffice with `SinglePageSheets` support (LibreOffice 6.4+; use a current supported release). The app verifies one output page per source sheet before excluding hidden pages. If empty/unsupported sheets or engine differences make the counts differ, it refuses to return that PDF. Use Original mode or an Excel copy without empty sheets in that case. Hidden rows/columns within visible sheets continue to follow the renderer's behavior.

Arabic/RTL: install the original fonts if licensed, and compare with Excel output. This update does not reverse text, insert bidi markers or replace fonts automatically; those changes could corrupt correct content. Without the original workbook and fonts the screenshot's Arabic ordering difference remains unverified.
