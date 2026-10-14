// Vercel serverless: Gemini proxy for HeatScan 3D.
// The browser can't call Gemini directly (no CORS), so /api/gemini is
// forwarded server-side. The key stays the user's: sent per request
// (query param), forwarded, never stored. The POST body is the raw
// Gemini request ({contents, generationConfig}) and is passed through.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = req.query.key;
  const modelName = req.query.model || 'gemini-3.5-flash-lite';
  if (!key || key.length < 10) {
    return res.status(400).json({ error: 'valid key required' });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const data = await r.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(r.status).json(data);
  } catch {
    return res.status(502).json({ error: 'Gemini unreachable' });
  }
}
