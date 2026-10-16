import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Box, Button, Chip, CircularProgress, Container, CssBaseline, Divider, LinearProgress, Paper, Stack, ThemeProvider, Typography, TextField, MenuItem, createTheme } from '@mui/material';
const theme = createTheme({ palette: { primary: { main: '#176b50' }, background: { default: '#f4f6f3' } }, typography: { fontFamily: 'Inter, Arial, sans-serif', h3: { fontWeight: 750, letterSpacing: '-1.4px' } }, shape: { borderRadius: 14 }, components: { MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700 } } } } });
function App() {
  const [file, setFile] = useState(null), [health, setHealth] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [pdf, setPdf] = useState(''), [report, setReport] = useState(null), [drag, setDrag] = useState(false);
  const [mode, setMode] = useState('whole-sheet'), [password, setPassword] = useState('');
  const input = useRef();
  useEffect(() => { fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => setError('Cannot reach the server. Check that the Node.js backend is running.')); }, []);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);
  function select(next) {
    if (busy || !next) return;
    setPdf(''); setReport(null); setError(''); setFile(null); setPassword('');
    if (!/\.(xlsx|xlsm|xls)$/i.test(next.name)) return setError('Choose an .xlsx, .xlsm, or .xls file.');
    if (next.size > 25 * 1024 * 1024) return setError('Maximum upload size is 25 MB.');
    if (/\.xls$/i.test(next.name)) setMode('original');
    setFile(next);
  }
  async function generate() {
    setBusy(true); setError(''); setPdf(''); setReport(null);
    try {
      const body = new FormData(); body.append('file', file); body.append('mode', mode); body.append('password', password); setPassword('');
      const response = await fetch('/api/convert', { method: 'POST', body });
      if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error || 'Conversion failed. Please try again.'); }
      const encoded = response.headers.get('X-Workbook-Report');
      const blob = await response.blob();
      setPdf(URL.createObjectURL(blob));
      if (encoded) setReport(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)))));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <ThemeProvider theme={theme}><CssBaseline />
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 6 }}><Typography fontWeight={800}>▦ &nbsp; Sheet to PDF</Typography><Chip size="small" label="Local conversion" variant="outlined" /></Stack>
      <Typography variant="overline" color="primary" fontWeight={800}>WORKBOOK IN. DOCUMENT OUT.</Typography>
      <Typography variant="h3" sx={{ mt: 1, fontSize: { xs: 34, md: 48 } }}>Your spreadsheet, ready to share.</Typography>
      <Typography color="text.secondary" sx={{ mt: 2, mb: 4, maxWidth: 650 }}>Keep every column together on a complete sheet, or use the workbook’s original print settings. Preview before sharing.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.35fr) minmax(0, 1fr)' }, gap: 3 }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}><Chip label="01" size="small" /><Typography variant="h6">Choose your workbook</Typography></Stack>
          <Box onDragOver={e => { e.preventDefault(); if (!busy) setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); select(e.dataTransfer.files[0]); }} sx={{ border: '2px dashed', borderColor: drag ? 'primary.main' : '#c8d4cc', bgcolor: drag ? '#edf8f0' : '#fafcf9', borderRadius: 3, p: 4, textAlign: 'center' }}>
            <Typography fontSize={36} color="primary">▦</Typography><Typography fontWeight={700} sx={{ overflowWrap: 'anywhere', mb: 1 }}>{file ? file.name : 'Drop your Excel file here'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'XLSX, XLSM or XLS · Up to 25 MB'}</Typography>
            <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" aria-label="Upload Excel workbook" hidden onChange={e => { select(e.target.files[0]); e.target.value = ''; }} />
            <Button variant="outlined" disabled={busy} onClick={() => input.current.click()}>{file ? 'Change file' : 'Browse files'}</Button>
          </Box>
          <TextField select fullWidth label="PDF layout" value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setPdf(''); setReport(null); }} sx={{ mt: 3 }}>
            <MenuItem value="whole-sheet" disabled={file && /\.xls$/i.test(file.name)}>Whole sheet on one page</MenuItem>
            <MenuItem value="original">Original print settings</MenuItem>
          </TextField>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{mode === 'whole-sheet' ? 'One content-sized page per visible sheet. Print areas and page breaks are ignored. Large sheets may need zooming.' : 'Uses saved paper size, scaling and print areas. Wide sheets may span several pages.'}</Typography>
          <TextField fullWidth type="password" label="Workbook password (if required to open)" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} autoComplete="off" helperText="Used only for this conversion and cleared when submitted. The downloaded PDF has no password." sx={{ mt: 3 }} />
          <Button fullWidth size="large" variant="contained" disabled={!file || busy || !health?.available} onClick={generate} sx={{ mt: 3, py: 1.5 }}>{busy ? 'Converting workbook…' : 'Generate PDF'}</Button>
          {busy && <Box role="status" sx={{ mt: 2 }}><LinearProgress /><Typography variant="body2" sx={{ mt: 1 }}>Rendering with LibreOffice. Large files may take up to two minutes.</Typography></Box>}
          {!health && !error && <Typography variant="body2" sx={{ mt: 2 }}><CircularProgress size={12} /> Checking conversion engine…</Typography>}
          {health && <Alert severity={health.available ? 'success' : 'warning'} sx={{ mt: 2 }}>{health.available ? 'Conversion engine ready' : health.message}</Alert>}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </Paper>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
          <Typography variant="h6">Keep the workbook in control</Typography>
          <Typography color="text.secondary" sx={{ mt: 2 }}>Whole-sheet mode keeps columns on the same PDF page without shrinking them to A4. Original mode follows the saved print layout. Cell content and styles are not rebuilt.</Typography>
          <Divider sx={{ my: 3 }} />
          <Typography fontWeight={700}>Before you convert</Typography>
          <Box component="ul" sx={{ pl: 2.5, color: 'text.secondary', '& li': { mb: 1.5 } }}><li>Check Print Preview in Excel.</li><li>Install the original fonts on the conversion machine.</li><li>Refresh formulas and linked data, then save.</li><li>Review charts, merged cells and long text in the PDF.</li></Box>
          <Alert severity="info">Exact preservation is not guaranteed. Existing cell clipping can remain. Hidden sheets are excluded in whole-sheet mode. Files are deleted from server temporary storage after processing; the preview stays in this browser tab.</Alert>
        </Paper>
      </Box>
      {pdf && <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mt: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'center' }}><Box><Typography variant="h6">Your PDF is ready</Typography><Typography variant="body2" color="text.secondary">Review every page before sharing.</Typography></Box><Button variant="contained" component="a" href={pdf} download={file.name.replace(/\.[^.]+$/, '.pdf')}>Download PDF</Button></Stack>
        {report?.sheets?.length > 0 && <Typography variant="body2" sx={{ mt: 2 }}>Workbook: {report.sheetCount} sheets · {report.sheets.map(s => `${s.name}${s.hidden ? ' (hidden)' : ''}`).join(', ')}{report.sheetCount > 50 ? '…' : ''}</Typography>}
        {report?.warnings?.map(w => <Alert key={w} severity="warning" sx={{ mt: 2 }}>{w}</Alert>)}
        <Box component="iframe" title="Generated PDF preview" src={pdf} sx={{ width: '100%', height: { xs: 480, md: 720 }, mt: 3, border: '1px solid #dce3dc', borderRadius: 1 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>If your browser cannot display the preview, download the PDF to open it.</Typography>
      </Paper>}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 4 }}>Powered by LibreOffice · No macros are executed · Conversion runs on the machine hosting this app</Typography>
    </Container>
  </ThemeProvider>;
}
createRoot(document.getElementById('root')).render(<App />);
