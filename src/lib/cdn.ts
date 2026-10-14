// Asset base: in production builds, heavy assets (data, Cesium) load from
// the jsDelivr GitHub CDN; the Vercel deployment stays tiny (shell + API).
export const ASSET_BASE = import.meta.env.PROD
  ? 'https://cdn.jsdelivr.net/gh/shrayashkale/HeatScan-3D@master/dist'
  : '';
