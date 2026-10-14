// ─── HeatScan 3D ─────────────────────────────────────────────────────
// Nashik's urban heat, rebuilt as 3D intelligence: HD Landsat thermal
// draped on real terrain, a 3D heat surface, and AI that reasons over
// measurements — Q&A, a cool-down simulator, priority zones, reports.
import { useCallback, useEffect, useRef, useState } from 'react';
import Globe, { type GlobeHandle } from './components/Globe';
import Map2D from './components/Map2D';
import { getDeviceProfile } from './lib/device';
import Panel, { type Tab } from './components/Panel';
import {
  loadHeatData, probe, circleStats,
  type HeatData, type Grids, type ZoneStat, type ProbeResult,
} from './lib/heat';
import { simulate, type SimResult } from './lib/sim';
import { askHeat, explainZones, narrateSim, mitigationReport } from './lib/ai';

const KEY_LS = 'heatscan_gemini_key';

export default function App() {
  const globeRef = useRef<GlobeHandle>(null);
  const [data, setData] = useState<HeatData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('heat');
  const [probeState, setProbeState] = useState<{ lat: number; lon: number; r: ProbeResult } | null>(null);
  const [activeLayer, setActiveLayer] = useState('thermal');
  const [surfaceOn, setSurfaceOn] = useState(true);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_LS) ?? '');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [zoneExplanation, setZoneExplanation] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simNarrative, setSimNarrative] = useState<string | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [mode, setMode] = useState<'2d' | '3d'>(() => {
    try {
      const saved = localStorage.getItem('heatscan_mode');
      if (saved === '2d' || saved === '3d') return saved;
      return getDeviceProfile().prefer2D ? '2d' : '3d';
    } catch { return '3d'; }
  });
  const is3D = mode === '3d';
  const dataRef = useRef<HeatData | null>(null);
  const gridsRef = useRef<Grids | null>(null);

  useEffect(() => {
    localStorage.setItem(KEY_LS, apiKey);
  }, [apiKey]);

  const heatReady = useCallback(async () => {
    try {
      if (!dataRef.current || !gridsRef.current) {
        const { data: d, grids: g } = await loadHeatData();
        dataRef.current = d; gridsRef.current = g;
        setData(d);
      }
      await globeRef.current?.initHeat(dataRef.current, gridsRef.current);
    } catch (e: any) {
      setLoadError(e?.message ?? 'failed to load heat data');
    }
  }, []);

  const handleProbe = useCallback((lat: number, lon: number) => {
    const d = dataRef.current, g = gridsRef.current;
    if (!d || !g) return;
    setProbeState({ lat, lon, r: probe(d, g, lat, lon) });
  }, []);

  const runAi = useCallback(async (fn: () => Promise<string>, set: (s: string) => void) => {
    if (!apiKey) return;
    setAiLoading(true);
    try { set(await fn()); } catch (e: any) { set(`AI error: ${e?.message ?? 'request failed'}`); }
    setAiLoading(false);
  }, [apiKey]);

  const handleAsk = useCallback((q: string) => {
    const d = dataRef.current;
    if (!d) return;
    setTab('ai');
    void runAi(() => askHeat(apiKey, d, q, probeState?.r ?? null), setAiAnswer);
  }, [apiKey, probeState, runAi]);

  const handleExplainZones = useCallback(() => {
    const d = dataRef.current;
    if (!d) return;
    void runAi(() => explainZones(apiKey, d.priority_zones), setZoneExplanation);
  }, [apiKey, runAi]);

  const handleReport = useCallback(() => {
    const d = dataRef.current;
    if (!d) return;
    void runAi(() => mitigationReport(apiKey, d), setReport);
  }, [apiKey, runAi]);

  const handleSimulate = useCallback((input: { centerLat: number; centerLon: number; radiusKm: number; intervention: string; coverage: number }) => {
    const d = dataRef.current, g = gridsRef.current;
    if (!d || !g) return;
    const stats = circleStats(d, g, input.centerLat, input.centerLon, input.radiusKm);
    if (stats.meanT == null || stats.maxT == null) return;
    const result = simulate(input, { meanT: stats.meanT, maxT: stats.maxT }, d.cooling_coeffs, d.interventions);
    setSimResult(result);
    setSimNarrative(null);
    globeRef.current?.applySim({ centerLat: input.centerLat, centerLon: input.centerLon, radiusKm: input.radiusKm, deltaT: result.deltaT });
    if (apiKey) {
      setSimLoading(true);
      narrateSim(apiKey, d, result, result.label, input.radiusKm)
        .then(setSimNarrative)
        .catch((e) => setSimNarrative(`AI error: ${e?.message ?? 'request failed'}`))
        .finally(() => setSimLoading(false));
    }
  }, [apiKey]);

  const handleClearSim = useCallback(() => {
    setSimResult(null); setSimNarrative(null);
    globeRef.current?.applySim(null);
  }, []);

  const switchMode = useCallback((m: '2d' | '3d') => {
    try { localStorage.setItem('heatscan_mode', m); } catch { /* noop */ }
    setMode(m);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#05080f]">
      {is3D ? (
        <Globe key="g3d" ref={globeRef} onProbe={handleProbe} onReady={heatReady} />
      ) : (
        <Map2D key="m2d" ref={globeRef} onProbe={handleProbe} onReady={heatReady} />
      )}
      {loadError && (
        <div className="absolute top-3 right-3 bg-red-500/90 text-white text-[12px] rounded-xl px-4 py-2.5 max-w-[300px]">
          Data failed to load: {loadError}
        </div>
      )}
      <Panel
        data={data}
        tab={tab} setTab={setTab}
        probe={probeState}
        onLayer={(l) => { setActiveLayer(l); globeRef.current?.setBaseLayer(l); }}
        onToggleSurface={(on) => { setSurfaceOn(on); globeRef.current?.toggleSurface(on); }}
        onFocusZone={(z: ZoneStat | null) => globeRef.current?.focusZone(z)}
        onSimulate={handleSimulate}
        onClearSim={handleClearSim}
        simResult={simResult}
        simNarrative={simNarrative}
        simLoading={simLoading}
        onAsk={handleAsk}
        aiAnswer={aiAnswer}
        aiLoading={aiLoading}
        onExplainZones={handleExplainZones}
        zoneExplanation={zoneExplanation}
        onReport={handleReport}
        report={report}
        apiKey={apiKey}
        setApiKey={setApiKey}
        surfaceOn={surfaceOn}
        activeLayer={activeLayer}
        is3D={is3D}
      />
      <div className="absolute bottom-4 right-4 flex gap-2">
        <div className="bg-[#0a0f1c]/85 backdrop-blur border border-white/10 rounded-xl p-0.5 flex text-[12px] font-semibold">
          <button
            onClick={() => switchMode('2d')}
            className={`px-3 py-1.5 rounded-lg transition ${!is3D ? 'bg-orange-500/90 text-white' : 'text-slate-300 hover:bg-white/10'}`}
          >2D</button>
          <button
            onClick={() => switchMode('3d')}
            className={`px-3 py-1.5 rounded-lg transition ${is3D ? 'bg-orange-500/90 text-white' : 'text-slate-300 hover:bg-white/10'}`}
          >3D</button>
        </div>
        <button
          onClick={() => globeRef.current?.flyHome()}
          className="bg-[#0a0f1c]/85 backdrop-blur border border-white/10 text-slate-200 text-[12px] font-semibold rounded-xl px-3.5 py-2 hover:bg-white/10"
        >
          ⌂ Nashik
        </button>
      </div>
    </div>
  );
}
