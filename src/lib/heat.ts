// ─── HeatScan 3D: heat data layer ───────────────────────────────────
// Loads the HD-baked Landsat products (data.json + .npy grids),
// bilinear sampling, inferno colormap. Everything the AI features
// reason about comes from these real measurements.
import { ASSET_BASE } from './cdn';

export interface Cluster {
  lat: number; lon: number; tmax?: number; tmin?: number;
  tmean: number; area_ha: number;
}
export interface ZoneStat {
  id: number; name: string; lat: number; lon: number;
  mean_temp: number; max_temp: number; mean_ndvi: number;
  score: number; area_ha: number;
}
export interface HeatStats {
  min: number; max: number; mean: number; median: number;
  std: number; p5: number; p95: number; n_valid: number;
}
export interface CoolingCoeff { delta_t_per_ha: number; max_delta: number; cost_inr_per_ha: number }
export interface Intervention { key: string; label: string; blurb: string }

export interface HeatData {
  scene: string; date: string; satellite: string; product: string;
  resolution_m: number;
  bounds: [[number, number], [number, number]]; // [SW, NE] as [lat, lon]
  grid_shape: [number, number];                 // [H, W]
  stats: HeatStats;
  uhi_intensity: number;
  hotspots: Cluster[];
  coolspots: Cluster[];
  priority_zones: ZoneStat[];
  cooling_coeffs: Record<string, CoolingCoeff>;
  interventions: Intervention[];
}

export interface Grids {
  H: number; W: number;
  lst: Int16Array;    // °C * 10, -9999 = nodata
  ndvi: Int16Array;   // NDVI * 1000, -9999 = nodata
  priority: Uint8Array; // 0..100
}

export const NODATA = -9999;

export async function loadHeatData(base = ASSET_BASE ? `${ASSET_BASE}/data` : 'data'): Promise<{ data: HeatData; grids: Grids }> {
  const data: HeatData = await (await fetch(`${base}/data.json`)).json();
  const [H, W] = data.grid_shape;
  const lst = parseNpy(await (await fetch(`${base}/lst_hd.npy`)).arrayBuffer());
  const ndvi = parseNpy(await (await fetch(`${base}/ndvi_hd.npy`)).arrayBuffer());
  const priority = parseNpy(await (await fetch(`${base}/priority_hd.npy`)).arrayBuffer());
  if (lst.shape[0] !== H || lst.shape[1] !== W) throw new Error('LST grid shape mismatch');
  return {
    data,
    grids: {
      H, W,
      lst: lst.data as Int16Array,
      ndvi: ndvi.data as Int16Array,
      priority: priority.data as Uint8Array,
    },
  };
}

export function parseNpy(buf: ArrayBuffer): { shape: number[]; data: Int16Array | Uint8Array | Float32Array } {
  const bytes = new Uint8Array(buf);
  if (bytes[0] !== 0x93 || String.fromCharCode(bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]) !== 'NUMPY')
    throw new Error('not an npy file');
  const dv = new DataView(buf);
  const headerLen = dv.getUint16(8, true);
  const header = new TextDecoder().decode(bytes.slice(10, 10 + headerLen));
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  const shapeRaw = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1] ?? '';
  const shape = shapeRaw.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  const offset = 10 + headerLen;
  const n = shape.reduce((a, b) => a * b, 1);
  let arr: Int16Array | Uint8Array | Float32Array;
  if (descr === '<i2') arr = new Int16Array(buf, offset, n);
  else if (descr === '|u1') arr = new Uint8Array(buf, offset, n);
  else if (descr === '<f4') arr = new Float32Array(buf, offset, n);
  else throw new Error('unsupported npy dtype: ' + descr);
  return { shape, data: arr };
}

// ─── inferno colormap (sampled stops, linear interp) ───
const INFERNO: [number, number, number, number][] = [
  [0.0, 0, 0, 4], [0.13, 31, 12, 72], [0.25, 85, 15, 109],
  [0.38, 136, 34, 106], [0.5, 186, 54, 85], [0.63, 227, 89, 51],
  [0.75, 249, 140, 10], [0.88, 249, 201, 50], [1.0, 252, 255, 164],
];
export function inferno(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < INFERNO.length; i++) {
    if (x <= INFERNO[i][0]) {
      const [t0, r0, g0, b0] = INFERNO[i - 1];
      const [t1, r1, g1, b1] = INFERNO[i];
      const f = (x - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return [252, 255, 164];
}

// ─── bilinear sampling on the HD grids ───
export function gridRowCol(data: HeatData, H: number, W: number, lat: number, lon: number): [number, number] {
  const [[sLat, wLon], [nLat, eLon]] = data.bounds;
  const r = ((nLat - lat) / (nLat - sLat)) * (H - 1);
  const c = ((lon - wLon) / (eLon - wLon)) * (W - 1);
  return [r, c];
}

function bilinear(arr: Int16Array | Uint8Array, H: number, W: number, r: number, c: number, scale: number): number | null {
  const r0 = Math.floor(r), c0 = Math.floor(c);
  const r1 = Math.min(H - 1, r0 + 1), c1 = Math.min(W - 1, c0 + 1);
  if (r0 < 0 || c0 < 0 || r0 >= H || c0 >= W) return null;
  const fr = r - r0, fc = c - c0;
  const v = (rr: number, cc: number) => {
    const x = arr[rr * W + cc];
    return x === NODATA ? NaN : x / scale;
  };
  const a = v(r0, c0), b = v(r0, c1), d = v(r1, c0), e = v(r1, c1);
  if ([a, b, d, e].some(Number.isNaN)) {
    // fall back to nearest valid
    const vals = [a, b, d, e].filter((x) => !Number.isNaN(x));
    return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
  }
  return a * (1 - fr) * (1 - fc) + b * (1 - fr) * fc + d * fr * (1 - fc) + e * fr * fc;
}

export interface ProbeResult { temp: number | null; ndvi: number | null; priority: number | null }

export function probe(data: HeatData, grids: Grids, lat: number, lon: number): ProbeResult {
  const { H, W } = grids;
  const [r, c] = gridRowCol(data, H, W, lat, lon);
  return {
    temp: bilinear(grids.lst, H, W, r, c, 10),
    ndvi: bilinear(grids.ndvi, H, W, r, c, 1000),
    priority: bilinear(grids.priority, H, W, r, c, 1),
  };
}

/** Mean/max temperature inside a circle — feeds the simulator with real numbers. */
export function circleStats(
  data: HeatData, grids: Grids, lat: number, lon: number, radiusKm: number,
): { meanT: number | null; maxT: number | null; validFrac: number } {
  const { H, W } = grids;
  const [[sLat, wLon], [nLat, eLon]] = data.bounds;
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos((lat * Math.PI) / 180);
  const dLat = radiusKm / kmPerDegLat;
  const dLon = radiusKm / kmPerDegLon;
  const [rC, cC] = gridRowCol(data, H, W, lat, lon);
  const rR = (dLat / (nLat - sLat)) * H;
  const cR = (dLon / (eLon - wLon)) * W;
  let sum = 0, n = 0, max = -Infinity;
  const rMin = Math.max(0, Math.floor(rC - rR)), rMax = Math.min(H - 1, Math.ceil(rC + rR));
  const cMin = Math.max(0, Math.floor(cC - cR)), cMax = Math.min(W - 1, Math.ceil(cC + cR));
  for (let r = rMin; r <= rMax; r += 2) {
    for (let c = cMin; c <= cMax; c += 2) {
      const dr = (r - rC) / rR, dc = (c - cC) / cR;
      if (dr * dr + dc * dc > 1) continue;
      const v = grids.lst[r * W + c];
      if (v === NODATA) continue;
      const t = v / 10;
      sum += t; n++;
      if (t > max) max = t;
    }
  }
  const total = ((rMax - rMin) / 2) * ((cMax - cMin) / 2);
  return {
    meanT: n ? sum / n : null,
    maxT: n ? max : null,
    validFrac: total > 0 ? n / total : 0,
  };
}

export function fmtINR(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
