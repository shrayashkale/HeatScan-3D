// HeatScan 3D server: serves the static frontend + proxies Gemini.
// Browsers can't call Gemini directly (no CORS headers), so /api/gemini
// is forwarded server-side. The key stays the user's: sent per request
// from their browser, forwarded, never stored.
//
// Run: npm run serve   (builds, then serves on http://localhost:5173)
// In GitHub Codespaces: forward port 5173 as public to test on your phone.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 5173;

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.npy': 'application/octet-stream',
};

async function proxyGemini(req, res) {
  const u = new URL(req.url, 'http://x');
  const key = u.searchParams.get('key');
  const modelName = u.searchParams.get('model') || 'gemini-3.5-flash-lite';
  if (!key || key.length < 10) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'valid key required' }));
  }
  // Body is the raw Gemini request ({contents, generationConfig}) — passed through.
  let body = '';
  for await (const chunk of req) body += chunk;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await r.json();
    res.writeHead(r.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Gemini unreachable' }));
  }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/gemini') {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      return res.end();
    }
    return proxyGemini(req, res);
  }
  // static
  let filePath = path.join(DIST, u.pathname === '/' ? 'index.html' : u.pathname.slice(1));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403); return res.end();
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(DIST, 'index.html'), (err2, data2) => {
        if (err2) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`HeatScan 3D live at http://localhost:${PORT}`);
});
