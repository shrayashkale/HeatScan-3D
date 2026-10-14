// ─── HeatScan 2D lite map ──────────────────────────────────────────
// Lightweight Leaflet map for weak devices (software WebGL, phones).
// Same data, same AI features — just fast. Implements the GlobeHandle
// interface so App.tsx can swap it with the Cesium globe freely.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ASSET_BASE } from '../lib/cdn';
import type { GlobeHandle, SimOverlay } from './Globe';
import type { HeatData, Grids, ZoneStat } from '../lib/heat';

interface Props {
  onProbe: (lat: number, lon: number) => void;
  onReady: () => void;
}

const NASHIK: [number, number] = [20.0, 73.8];
const A = (p: string) => (ASSET_BASE ? `${ASSET_BASE}/${p}` : p);

function pinIcon(temp: string) {
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center;transform:translate(-50%,-100%)">
      <div style="font:700 11px system-ui;color:#fff;background:#7f1d1d;border:2px solid #ef4444;border-radius:8px;padding:1px 6px;white-space:nowrap">${temp}</div>
      <div style="font-size:20px;line-height:1">📍</div></div>`,
    iconSize: [0, 0],
  });
}

const Map2D = forwardRef<GlobeHandle, Props>(({ onProbe, onReady }, ref) => {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlaysRef = useRef<Record<string, L.ImageOverlay>>({});
  const simLayerRef = useRef<L.Circle | null>(null);
  const heatRef = useRef<{ data: HeatData; grids: Grids } | null>(null);
  const probeCb = useRef(onProbe);
  probeCb.current = onProbe;
  const readyCb = useRef(onReady);
  readyCb.current = onReady;

  useEffect(() => {
    const el = divRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
    }).setView(NASHIK, 11);
    mapRef.current = map;
    L.tileLayer('https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors © CARTO',
    }).addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => probeCb.current(e.latlng.lat, e.latlng.lng));
    // signal ready on next tick so App can load heat data
    setTimeout(() => readyCb.current(), 0);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useImperativeHandle(ref, () => ({
    async initHeat(d: HeatData, g: Grids) {
      const map = mapRef.current;
      if (!map) return;
      heatRef.current = { data: d, grids: g };
      const [[sLat, wLon], [nLat, eLon]] = d.bounds;
      const bounds: L.LatLngBoundsExpression = [[sLat, wLon], [nLat, eLon]];
      const mk = (key: string, file: string, opacity = 0.88) => {
        const ov = L.imageOverlay(A(`data/${file}`), bounds, { opacity, interactive: false });
        overlaysRef.current[key] = ov;
        return ov;
      };
      mk('thermal', 'thermal_hd.png').addTo(map);
      mk('ndvi', 'ndvi_hd.png');
      mk('truecolor', 'truecolor_hd.png');
      // hotspot pins
      for (const h of d.hotspots.slice(0, 8)) {
        L.marker([h.lat, h.lon], { icon: pinIcon(`${h.tmax?.toFixed(0) ?? ''}°C`), interactive: false })
          .addTo(map);
      }
      // curated labels
      const labelPos: [string, [number, number]][] = [
        ['Nashik', [20.0, 73.78]], ['Igatpuri', [19.94, 73.56]],
        ['Niphad', [20.08, 74.11]], ['Sinnar', [19.84, 74.0]],
      ];
      for (const [name, pos] of labelPos) {
        L.marker(pos, {
          icon: L.divIcon({ className: '', html: `<div style="font:600 12px system-ui;color:#fff;text-shadow:0 1px 4px #000;white-space:nowrap">${name}</div>`, iconSize: [0, 0] }),
          interactive: false,
        }).addTo(map);
      }
      map.flyTo(NASHIK, 11, { duration: 1.2 });
    },
    setBaseLayer(name) {
      const O = overlaysRef.current;
      if (!O.thermal) return;
      const map = mapRef.current!;
      for (const k of ['thermal', 'ndvi', 'truecolor']) {
        const ov = O[k];
        if (name === k) { if (!map.hasLayer(ov)) ov.addTo(map); }
        else if (map.hasLayer(ov)) map.removeLayer(ov);
      }
    },
    toggleSurface(_on: boolean) { /* 2D has no 3D surface — thermal overlay is the heat view */ },
    focusZone(z: ZoneStat | null) {
      const map = mapRef.current;
      if (!map) return;
      if (z) map.flyTo([z.lat, z.lon], 13, { duration: 1.2 });
      else map.flyTo(NASHIK, 11, { duration: 1.2 });
    },
    applySim(sim: SimOverlay | null) {
      const map = mapRef.current;
      if (!map) return;
      if (simLayerRef.current) { map.removeLayer(simLayerRef.current); simLayerRef.current = null; }
      if (!sim) return;
      const c = L.circle([sim.centerLat, sim.centerLon], {
        radius: sim.radiusKm * 1000,
        color: '#22d3ee', weight: 2, fillColor: '#22d3ee', fillOpacity: 0.18,
      }).addTo(map);
      simLayerRef.current = c;
      map.flyTo([sim.centerLat, sim.centerLon], 12, { duration: 1.2 });
    },
    flyHome() {
      mapRef.current?.flyTo(NASHIK, 11, { duration: 1.2 });
    },
  }), []);

  return <div ref={divRef} className="absolute inset-0 z-0" style={{ background: '#05080f' }} />;
});

export default Map2D;
