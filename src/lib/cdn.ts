// Asset base: in production builds, heavy data files load from
// raw.githubusercontent (jsDelivr 503s on .npy binaries); the JS/CSS
// shell stays on jsDelivr via the Vercel index.html.
export const ASSET_BASE = import.meta.env.PROD
  ? 'https://raw.githubusercontent.com/shrayashkale/HeatScan-3D/master/dist'
  : '';
