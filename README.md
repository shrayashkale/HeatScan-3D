# HeatScan 3D — Nashik Urban Heat Intelligence

Nashik's urban heat island, rebuilt as 3D intelligence. A CesiumJS globe where
Landsat 9 surface temperature becomes a landscape you can explore — plus AI
that reasons over real measurements.

## What it does

- **3D heat surface** — 30m Landsat 9 thermal data (2026-05-16) draped on real
  3D terrain; temperature rendered as elevation + inferno colors
- **HD layers** — thermal / NDVI / true-color, native resolution (730×1121)
- **Click-to-probe** — live temperature, NDVI, and priority score anywhere
- **Priority zones** — 15 zones ranked by heat × vegetation deficit (computed,
  not guessed)
- **Cool-down simulator** — pick a spot + intervention (urban forest, cool roofs,
  water body, green corridor) → projected °C drop, cost in ₹, before/after on
  the globe
- **AI analyst** — grounded Q&A over the measurements, zone explanations,
  one-click mitigation report (BYO Gemini key)

## Run it

```bash
npm install
npm run serve   # → http://localhost:5173
```

Paste your Gemini API key in the panel footer to unlock AI features.
The key stays in your browser and is forwarded per request — never stored.

## Data

- Landsat 9 Collection 2 Level-2, scene LC09_L2SP_147046_20260516 (0% cloud)
- LST: min 28.1 / max 59.2 / mean 47.4 °C · UHI intensity 17.8 °C
- Bake script: `../hd_bake.py` (reproducible from raw bands in `../raw/`)

Cooling coefficients in the simulator are literature-based planning estimates,
documented in `public/data/data.json` — not measurements.

## Deploy

Vercel: static frontend + `api/gemini.js` serverless proxy. No env vars needed.

## Credits

CesiumJS · Esri World Imagery · ArcGIS Terrain3D · Landsat 9 (USGS/NASA) ·
Google Gemini
