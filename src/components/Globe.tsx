// ─── HeatScan 3D globe ───────────────────────────────────────────────
// Esri imagery + real 3D terrain + sun lighting. The Landsat thermal bake
// drapes the terrain as an HD heat layer, and a 3D heat surface rises
// over hotspots — temperature you can see as landscape.
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { LABELS, labelAlpha } from '../lib/labels';
import { ASSET_BASE } from '../lib/cdn';
import { inferno, type HeatData, type Grids, type ZoneStat, probe } from '../lib/heat';

declare global { interface Window { Cesium?: any } }

export interface SimOverlay { centerLat: number; centerLon: number; radiusKm: number; deltaT: number }

export interface GlobeHandle {
  initHeat: (d: HeatData, g: Grids) => Promise<void>;
  setBaseLayer: (name: 'thermal' | 'ndvi' | 'truecolor' | 'satellite') => void;
  toggleSurface: (on: boolean) => void;
  focusZone: (z: ZoneStat | null) => void;
  applySim: (sim: SimOverlay | null) => void;
  flyHome: () => void;
}

interface Props {
  onProbe: (lat: number, lon: number) => void;
  onReady: () => void;
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
// Fallback base maps if the primary tile host is unreachable for the viewer.
const FALLBACKS = [
  { url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', credit: '© OpenStreetMap contributors © CARTO' },
  { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', credit: '© OpenStreetMap contributors' },
];
const NASHIK = { lat: 20.0, lon: 73.8 };

function makePin(color: string): string {
  const c = document.createElement('canvas');
  c.width = 68; c.height = 88;
  const x = c.getContext('2d')!;
  x.fillStyle = color; x.strokeStyle = '#060b16'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(16, 46); x.lineTo(52, 46); x.lineTo(34, 82); x.closePath(); x.fill(); x.stroke();
  x.beginPath(); x.arc(34, 30, 24, 0, Math.PI * 2); x.fill(); x.stroke();
  x.fillStyle = '#060b16'; x.beginPath(); x.arc(34, 30, 10, 0, Math.PI * 2); x.fill();
  return c.toDataURL();
}

const Globe = forwardRef<GlobeHandle, Props>(({ onProbe, onReady }, ref) => {
  const divRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const layersRef = useRef<Record<string, any>>({});
  const surfaceRef = useRef<any>(null);
  const surfaceMeta = useRef<{ temps: Float32Array; lats: Float32Array; lons: Float32Array; rows: number; cols: number } | null>(null);
  const zoneEntRef = useRef<any>(null);
  const simEntRef = useRef<any>(null);
  const simRef = useRef<SimOverlay | null>(null);
  const heatRef = useRef<{ data: HeatData; grids: Grids } | null>(null);
  const surfaceOn = useRef(true);
  const probeCb = useRef(onProbe);
  probeCb.current = onProbe;
  const readyCb = useRef(onReady);
  readyCb.current = onReady;
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  // ── heat surface: temperature as 3D landscape ──
  // Terrain heights are sampled once and cached; sim re-runs only recolor.
  const heightsCache = useRef<number[] | null>(null);
  const buildSurface = async (C: any, v: any, data: HeatData, grids: Grids, sim: SimOverlay | null) => {
    const { H, W } = grids;
    const [[sLat, wLon], [nLat, eLon]] = data.bounds;
    // decimate to ~ manageable mesh
    const step = Math.max(1, Math.floor(H / 110));
    const rows: number[] = [];
    for (let r = 0; r < H; r += step) rows.push(r);
    const cols: number[] = [];
    for (let c = 0; c < W; c += step) cols.push(c);
    const R = rows.length, Cc = cols.length;

    const lats = new Float32Array(R * Cc);
    const lons = new Float32Array(R * Cc);
    const temps = new Float32Array(R * Cc);
    const cartos: any[] = [];
    let idx = 0;
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < Cc; j++) {
        const r = rows[i], c = cols[j];
        const lat = nLat - (r / (H - 1)) * (nLat - sLat);
        const lon = wLon + (c / (W - 1)) * (eLon - wLon);
        const raw = grids.lst[r * W + c];
        const t = raw === -9999 ? NaN : raw / 10;
        lats[idx] = lat; lons[idx] = lon;
        temps[idx] = Number.isNaN(t) ? -999 : t;
        cartos.push(C.Cartographic.fromDegrees(lon, lat));
        idx++;
      }
    }
    // drape on real terrain, then lift by temperature (fall back to ellipsoid if terrain fails)
    let heights: number[];
    if (heightsCache.current && heightsCache.current.length === cartos.length) {
      heights = heightsCache.current;
    } else {
      try {
        const sampled = await C.sampleTerrainMostDetailed(v.terrainProvider, cartos);
        heights = sampled.map((s: any) => s.height || 0);
      } catch {
        heights = cartos.map(() => 0);
      }
      heightsCache.current = heights;
    }
    const tmin = data.stats.p5 - 2, tmax = data.stats.max;
    const LIFT = 30; // meters per °C
    const positions = new Float64Array(R * Cc * 3);
    const colors = new Float32Array(R * Cc * 4);
    for (let k = 0; k < R * Cc; k++) {
      const t = temps[k];
      const base = heights[k];
      const lift = t < -900 ? 0 : (t - tmin) * LIFT;
      const p = C.Cartesian3.fromDegrees(lons[k], lats[k], base + lift);
      positions[k * 3] = p.x; positions[k * 3 + 1] = p.y; positions[k * 3 + 2] = p.z;
      let tt = t;
      if (sim && t > -900) {
        const dLat = (lats[k] - sim.centerLat) * 111.32;
        const dLon = (lons[k] - sim.centerLon) * 111.32 * Math.cos((sim.centerLat * Math.PI) / 180);
        const d = Math.sqrt(dLat * dLat + dLon * dLon);
        if (d < sim.radiusKm) tt = t + sim.deltaT * (1 - (d / sim.radiusKm) ** 2);
      }
      const [rC, gC, bC] = t < -900 ? [11, 14, 23] : inferno((tt - tmin) / (tmax - tmin)).map((x) => x / 255) as [number, number, number];
      colors[k * 4] = rC; colors[k * 4 + 1] = gC; colors[k * 4 + 2] = bC; colors[k * 4 + 3] = 1;
    }
    const indices: number[] = [];
    const at = (i: number, j: number) => i * Cc + j;
    for (let i = 0; i < R - 1; i++) {
      for (let j = 0; j < Cc - 1; j++) {
        const a = at(i, j), b = at(i, j + 1), d2 = at(i + 1, j), e = at(i + 1, j + 1);
        if ([a, b, d2, e].every((k) => temps[k] > -900)) indices.push(a, d2, b, b, d2, e);
      }
    }
    const geometry = new C.Geometry({
      attributes: {
        position: new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions }),
        color: new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.FLOAT, componentsPerAttribute: 4, values: colors }),
      },
      indices: new Uint32Array(indices),
      primitiveType: C.PrimitiveType.TRIANGLES,
      boundingSphere: C.BoundingSphere.fromVertices(positions),
    });
    surfaceMeta.current = { temps, lats, lons, rows: R, cols: Cc };
    return new C.Primitive({
      geometryInstances: new C.GeometryInstance({ geometry }),
      appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: false }),
      asynchronous: false,
    });
  };

  const refreshSurface = async (sim: SimOverlay | null) => {
    const C = window.Cesium;
    const v = viewerRef.current;
    const h = heatRef.current;
    if (!C || !v || !h) return;
    if (surfaceRef.current) { v.scene.primitives.remove(surfaceRef.current); surfaceRef.current = null; }
    if (!surfaceOn.current) return;
    try {
      surfaceRef.current = await buildSurface(C, v, h.data, h.grids, sim);
      v.scene.primitives.add(surfaceRef.current);
    } catch (e) {
      console.warn('heat surface failed', e);
    }
  };

  useImperativeHandle(ref, () => ({
    async initHeat(d: HeatData, g: Grids) {
      const C = window.Cesium;
      const v = viewerRef.current;
      if (!C || !v) return;
      heatRef.current = { data: d, grids: g };
      const [[sLat, wLon], [nLat, eLon]] = d.bounds;
      const rect = C.Rectangle.fromDegrees(wLon, sLat, eLon, nLat);
      const mk = (url: string) => v.imageryLayers.addImageryProvider(
        new C.SingleTileImageryProvider({ url, rectangle: rect }),
      );
      const A = (p: string) => (ASSET_BASE ? `${ASSET_BASE}/${p}` : p);
      layersRef.current.thermal = mk(A('data/thermal_hd.png'));
      layersRef.current.ndvi = mk(A('data/ndvi_hd.png'));
      layersRef.current.truecolor = mk(A('data/truecolor_hd.png'));
      layersRef.current.ndvi.show = false;
      layersRef.current.truecolor.show = false;
      // hotspot pins
      const pinImg = makePin('#ef4444');
      for (const hspot of d.hotspots.slice(0, 8)) {
        v.entities.add({
          position: C.Cartesian3.fromDegrees(hspot.lon, hspot.lat, 1200),
          billboard: { image: pinImg, width: 26, height: 34, verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: {
            text: `${hspot.tmax?.toFixed(0)}°C`, font: '700 12px system-ui, sans-serif',
            fillColor: C.Color.WHITE, outlineColor: C.Color.fromCssColorString('#060b16'), outlineWidth: 3,
            style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -40),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
      await refreshSurface(null);
      v.camera.flyTo({
        destination: C.Cartesian3.fromDegrees(NASHIK.lon, NASHIK.lat, 70_000),
        orientation: { heading: 0, pitch: -1.15, roll: 0 },
        duration: 3.5, easingFunction: C.EasingFunction.CUBIC_IN_OUT,
      });
    },
    setBaseLayer(name) {
      const L = layersRef.current;
      if (!L.thermal) return;
      L.thermal.show = name === 'thermal';
      L.ndvi.show = name === 'ndvi';
      L.truecolor.show = name === 'truecolor';
    },
    toggleSurface(on: boolean) {
      surfaceOn.current = on;
      void refreshSurface(simRef.current);
    },
    focusZone(z: ZoneStat | null) {
      const C = window.Cesium;
      const v = viewerRef.current;
      if (!C || !v) return;
      if (zoneEntRef.current) { v.entities.remove(zoneEntRef.current); zoneEntRef.current = null; }
      if (!z) return;
      zoneEntRef.current = v.entities.add({
        position: C.Cartesian3.fromDegrees(z.lon, z.lat),
        ellipse: {
          semiMajorAxis: 2200, semiMinorAxis: 2200,
          material: C.Color.fromCssColorString('#22d3ee').withAlpha(0.25),
          outline: true, outlineColor: C.Color.fromCssColorString('#22d3ee'),
        },
      });
      v.camera.flyTo({
        destination: C.Cartesian3.fromDegrees(z.lon, z.lat, 28_000),
        orientation: { heading: 0, pitch: -1.1, roll: 0 },
        duration: 2.4, easingFunction: C.EasingFunction.CUBIC_IN_OUT,
      });
    },
    applySim(sim: SimOverlay | null) {
      simRef.current = sim;
      const C = window.Cesium;
      const v = viewerRef.current;
      if (!C || !v) return;
      if (simEntRef.current) { v.entities.remove(simEntRef.current); simEntRef.current = null; }
      if (sim) {
        simEntRef.current = v.entities.add({
          position: C.Cartesian3.fromDegrees(sim.centerLon, sim.centerLat),
          ellipse: {
            semiMajorAxis: sim.radiusKm * 1000, semiMinorAxis: sim.radiusKm * 1000,
            material: C.Color.fromCssColorString('#34d399').withAlpha(0.18),
            outline: true, outlineColor: C.Color.fromCssColorString('#34d399'),
          },
        });
        v.camera.flyTo({
          destination: C.Cartesian3.fromDegrees(sim.centerLon, sim.centerLat, 45_000),
          orientation: { heading: 0, pitch: -1.15, roll: 0 },
          duration: 2.2, easingFunction: C.EasingFunction.CUBIC_IN_OUT,
        });
      }
      void refreshSurface(sim);
    },
    flyHome() {
      const C = window.Cesium;
      const v = viewerRef.current;
      if (!C || !v) return;
      v.camera.flyTo({
        destination: C.Cartesian3.fromDegrees(NASHIK.lon, NASHIK.lat, 70_000),
        orientation: { heading: 0, pitch: -1.15, roll: 0 },
        duration: 2.5, easingFunction: C.EasingFunction.CUBIC_IN_OUT,
      });
    },
  }));

  useEffect(() => {
    if (!window.Cesium) { setFailed(true); return; }
    const C = window.Cesium;
    const el = divRef.current;
    if (!el) return;

    const viewer = new C.Viewer(el, {
      animation: false, baseLayerPicker: false, fullscreenButton: false,
      geocoder: false, homeButton: false, infoBox: false,
      sceneModePicker: false, selectionIndicator: false,
      timeline: false, navigationHelpButton: false,
      imageryProvider: false,
      // Ellipsoid terrain: zero network dependency, the globe always renders.
      // (ArcGIS 3D terrain was dropped — when its tiles are unreachable the
      // whole globe fails to draw. The heat surface mesh provides the relief.)
      terrainProvider: new C.EllipsoidTerrainProvider(),
      creditContainer: document.createElement('div'),
    });
    viewerRef.current = viewer;

    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.dynamicAtmosphereLighting = true;
    viewer.scene.globe.atmosphereLightIntensity = 8.0;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00008;

    const addBaseWithFallback = (idx: number) => {
      const src = idx === 0
        ? { url: ESRI, credit: 'Esri, Maxar, Earthstar Geographics', max: 19 }
        : { url: FALLBACKS[idx - 1].url, credit: FALLBACKS[idx - 1].credit, max: 20 };
      const provider = new C.UrlTemplateImageryProvider({
        url: src.url, maximumLevel: src.max, credit: new C.Credit(src.credit),
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider, 0);
      if (idx <= FALLBACKS.length) {
        let errs = 0;
        provider.errorEvent.addEventListener(() => {
          if (++errs < 8) return; // tolerate a few flaky tiles
          try { viewer.imageryLayers.remove(layer, false); } catch { /* noop */ }
          addBaseWithFallback(idx + 1);
        });
      }
    };
    addBaseWithFallback(0);

    const labelEnts: { ent: any; def: (typeof LABELS)[number] }[] = [];
    for (const def of LABELS) {
      const ent = viewer.entities.add({
        position: C.Cartesian3.fromDegrees(def.lon, def.lat, 1500),
        label: {
          text: def.name, font: `600 ${def.size}px system-ui, sans-serif`,
          fillColor: C.Color.WHITE.withAlpha(0.92),
          outlineColor: C.Color.fromCssColorString('#060b16'), outlineWidth: 3,
          style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -12),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      labelEnts.push({ ent, def });
    }
    let fadeQueued = false;
    const fadeLabels = () => {
      fadeQueued = false;
      const h = viewer.camera.positionCartographic.height;
      for (const { ent, def } of labelEnts) {
        const a = labelAlpha(def, h);
        ent.label.translucency = 1 - a;
        ent.show = a > 0.02;
      }
    };
    viewer.camera.changed.addEventListener(() => {
      if (!fadeQueued) { fadeQueued = true; requestAnimationFrame(fadeLabels); }
    });

    viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(NASHIK.lon, NASHIK.lat, 400_000) });
    fadeLabels();

    // click-to-probe
    const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const h = heatRef.current;
      if (!h) return;
      const cart = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (!cart) return;
      const c = C.Cartographic.fromCartesian(cart);
      const lat = (c.latitude * 180) / Math.PI;
      const lon = (c.longitude * 180) / Math.PI;
      const [[sLat, wLon], [nLat, eLon]] = h.data.bounds;
      if (lat < sLat || lat > nLat || lon < wLon || lon > eLon) return;
      const p = probe(h.data, h.grids, lat, lon);
      if (p.temp == null) return;
      probeCb.current(lat, lon);
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    setReady(true);
    readyCb.current();
    return () => {
      handler.destroy();
      try { viewer.destroy(); } catch {}
      viewerRef.current = null;
    };
  }, []);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#05080f] text-slate-400 text-sm p-8 text-center">
        Couldn't load the 3D engine (Cesium CDN unreachable). Check your connection and reload.
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <div ref={divRef} className="w-full h-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05080f]">
          <p className="text-orange-400 text-sm animate-pulse">Heating up the planet…</p>
        </div>
      )}
    </div>
  );
});

export default Globe;
