// Asset base: in production builds, heavy data files load from
// raw.githubusercontent (jsDelivr 503s on .npy binaries); the JS/CSS
// shell stays on jsDelivr via the Vercel index.html.
export const ASSET_BASE = import.meta.env.PROD
  ? 'https://raw.githubusercontent.com/shrayashkale/HeatScan-3D/master/dist'
  : '';
// Vendor base (Cesium runtime): must be jsDelivr — it serves proper
// JavaScript MIME types, unlike raw.githubusercontent (text/plain,
// which browsers refuse to execute as <script>).
export const VENDOR_BASE = import.meta.env.PROD
  ? 'https://cdn.jsdelivr.net/gh/shrayashkale/HeatScan-3D@master/dist'
  : '';
