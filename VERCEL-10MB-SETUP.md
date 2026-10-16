# Enable 10 MB Excel uploads on Vercel

These updated files are based on your GitHub main branch. Copy them into the project root, preserving the client/, server/ and test/ folders. Keep your existing Dockerfile and other conversion files.

## 1. Connect private storage

Open your Vercel project → Storage → Create Storage → Blob. Choose **Private**, name it excel-pdf-private, and connect it to this project for Production and Preview. Keep the default environment-variable names. Never choose Public for these workbooks.

Vercel supplies the storage credentials (BLOB_READ_WRITE_TOKEN and/or the connected store's BLOB_STORE_ID/OIDC configuration). Do not paste credentials into the frontend, GitHub, or chat. The SDK resolves them on the server.

## 2. Set project environment variables

Keep HOST=0.0.0.0, PORT=3000 and LIBREOFFICE_PATH=/usr/bin/libreoffice. Set:

```
UPLOAD_MODE=blob
MAX_UPLOAD_MB=10
UPLOAD_ACCESS_KEY=<random secret of at least 32 characters>
CRON_SECRET=<a different random secret of at least 32 characters>
```

Generate each secret separately in your own Codespaces terminal:

```
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Enter the first secret in the app's new **Upload access code** field. This is separate from the Excel password. It grants upload access, so share it only with intended app users. The app keeps it in page memory, not localStorage. This is a simple shared-access app, not individual user accounts.

CRON_SECRET authenticates Vercel's daily cleanup. The included vercel.json configures that cron. If you have since added a vercel.json, merge its crons entry instead of overwriting other settings. Confirm the cleanup cron appears in the Vercel dashboard after deployment.

MAX_PDF_MB is no longer used by this patch: PDFs go through storage, not an API response. The new storage path limits generated PDFs to 100 MB. You may remove MAX_PDF_MB from Vercel settings.

## 3. Install, test, and push

Run from your project root in Codespaces:

```
npm ci
npm run build
npm test
git add client/main.jsx server/index.js server/config.js server/blob-storage.js package.json vercel.json test/blob-storage.test.js VERCEL-10MB-SETUP.md
git add -f package-lock.json
git commit -m "Support private 10 MB Excel uploads on Vercel"
git push
```

Wait until the new production deployment is Ready. If you change environment variables after it builds, redeploy.

## 4. Test on your live domain

Refresh the page. It should show **Up to 10 MB** and **Upload access code**. If the access-code field is missing, check UPLOAD_MODE=blob and that you deployed these frontend files.

Enter your upload access code, choose the 6–9 MB Excel file, and enter its workbook password if required. The browser uploads directly to the private store. The conversion API receives only a small JSON request. The PDF is downloaded directly from storage into browser memory, then previewed/downloaded locally.

Try a small ordinary workbook and a protected workbook too. Incorrect workbook passwords should produce a readable error. The downloaded PDF is not password protected.

## Codespaces

For conversion without cloud storage, your local .env can use:

```
HOST=0.0.0.0
PORT=3000
LIBREOFFICE_PATH=/usr/bin/libreoffice
UPLOAD_MODE=direct
MAX_UPLOAD_MB=10
```

Restart npm start after changes. To test blob mode in Codespaces, set UPLOAD_MODE=blob and configure the private store credentials and UPLOAD_ACCESS_KEY locally. Keep .env ignored by Git.

## Cleanup and limitations

- The workbook password is never saved to Blob storage or included in signed URLs. Temporary decrypted files are removed in the conversion request's cleanup.
- Input blobs are deleted after conversion. The browser requests deletion of both input and PDF after the download completes, or after a failure.
- Closing the browser, a crash, or a network interruption can leave private files behind. The daily cron deletes files older than one hour under excel-pdf-jobs/. They can remain roughly 25 hours until the next successful scheduled run. Failed cleanup runs require checking Logs and retrying the cleanup route with your CRON_SECRET.
- Upload links expire in 10 minutes, download links in 10 minutes, and conversion sessions in one hour. Anyone holding a signed URL can use it until expiry; do not share it.
- File size alone does not guarantee conversion success: LibreOffice still has a two-minute conversion timeout, and large/complex workbooks may exceed available memory or PDF limits. Formatting preservation is unchanged and is not guaranteed to be exact.
- Blob storage/transfer is subject to your Vercel plan's quota and pricing.

Validation here: frontend build; existing password, workbook, API and page-filter tests; mocked private-storage tests for exact 9 MB byte transfer, oversized stream rejection, session tampering/expiry, private PDF output and cleanup. Live Blob credentials and the production LibreOffice runtime were not available here, so a real protected-file conversion on your domain remains required.
