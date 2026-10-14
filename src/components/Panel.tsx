// ─── HeatScan 3D side panel ──────────────────────────────────────────
// One clean glass panel, four tabs: Heat / Zones / Simulator / AI.
import { useState } from 'react';
import type { HeatData, ZoneStat, ProbeResult } from '../lib/heat';
import { fmtINR } from '../lib/heat';
import { simSummary, type SimResult } from '../lib/sim';

export type Tab = 'heat' | 'zones' | 'sim' | 'ai';

interface Props {
  data: HeatData | null;
  tab: Tab;
  setTab: (t: Tab) => void;
  probe: { lat: number; lon: number; r: ProbeResult } | null;
  onLayer: (name: 'thermal' | 'ndvi' | 'truecolor' | 'satellite') => void;
  onToggleSurface: (on: boolean) => void;
  onFocusZone: (z: ZoneStat | null) => void;
  onSimulate: (input: { centerLat: number; centerLon: number; radiusKm: number; intervention: string; coverage: number }) => void;
  onClearSim: () => void;
  simResult: SimResult | null;
  simNarrative: string | null;
  simLoading: boolean;
  onAsk: (q: string) => void;
  aiAnswer: string | null;
  aiLoading: boolean;
  onExplainZones: () => void;
  zoneExplanation: string | null;
  onReport: () => void;
  report: string | null;
  apiKey: string;
  setApiKey: (k: string) => void;
  surfaceOn: boolean;
  activeLayer: string;
  is3D: boolean;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'heat', label: 'Heat' },
  { key: 'zones', label: 'Zones' },
  { key: 'sim', label: 'Simulator' },
  { key: 'ai', label: 'AI Analyst' },
];

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
      <div className="text-orange-300 font-bold text-sm leading-tight">{v}</div>
      <div className="text-[10px] text-slate-400">{l}</div>
    </div>
  );
}

export default function Panel(p: Props) {
  const [question, setQuestion] = useState('');
  const [simRadius, setSimRadius] = useState(1.5);
  const [simIntervention, setSimIntervention] = useState('urban_forest');
  const [simCoverage, setSimCoverage] = useState(0.6);
  const [simCenter, setSimCenter] = useState<{ lat: number; lon: number } | null>(null);
  const d = p.data;

  return (
    <div className="absolute top-3 left-3 bottom-3 w-[330px] max-w-[86vw] flex flex-col rounded-2xl bg-[#0a0f1c]/85 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden">
      {/* header */}
      <div className="px-4 pt-3 pb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌡️</span>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">HeatScan Nashik</h1>
            <p className="text-[11px] text-slate-400">{p.is3D ? '3D' : '2D lite'} urban heat intelligence · Landsat 9</p>
          </div>
        </div>
        <div className="flex gap-1 mt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => p.setTab(t.key)}
              className={`flex-1 text-[12px] font-semibold rounded-lg px-2 py-1.5 transition ${
                p.tab === t.key ? 'bg-orange-500/90 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {p.tab === 'heat' && d && (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              <Stat v={`${d.stats.max}°`} l="peak" />
              <Stat v={`${d.stats.mean}°`} l="mean" />
              <Stat v={`${d.uhi_intensity}°`} l="UHI" />
              <Stat v={`${d.stats.p95}°`} l="p95" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-300 mb-1.5">BASE LAYER</p>
              <div className="grid grid-cols-4 gap-1.5">
                {(['thermal', 'ndvi', 'truecolor', 'satellite'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => p.onLayer(l)}
                    className={`text-[11px] font-semibold rounded-lg px-1 py-1.5 capitalize ${
                      p.activeLayer === l ? 'bg-orange-500/90 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {l === 'ndvi' ? 'NDVI' : l}
                  </button>
                ))}
              </div>
              {p.is3D && (
                <label className="flex items-center gap-2 mt-2 text-[12px] text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={p.surfaceOn} onChange={(e) => p.onToggleSurface(e.target.checked)} className="accent-orange-500" />
                  3D heat surface
                </label>
              )}
            </div>
            {p.probe && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-orange-300 mb-1">PROBED POINT</p>
                <p className="text-white text-lg font-bold">{p.probe.r.temp?.toFixed(1)}°C</p>
                <p className="text-[11px] text-slate-400">
                  {p.probe.lat.toFixed(4)}, {p.probe.lon.toFixed(4)} · NDVI {p.probe.r.ndvi?.toFixed(2)} · priority {p.probe.r.priority?.toFixed(0)}/100
                </p>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold text-slate-300 mb-1.5">HOTTEST CLUSTERS</p>
              <div className="space-y-1.5">
                {d.hotspots.slice(0, 5).map((h, i) => (
                  <div key={i} className="flex justify-between text-[12px] bg-white/5 rounded-lg px-2.5 py-1.5">
                    <span className="text-slate-300">#{i + 1} · {h.area_ha} ha</span>
                    <span className="text-orange-300 font-bold">{h.tmax?.toFixed(1)}°C</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-slate-500">Click anywhere on the globe to probe live temperature. Scene: {d.date}.</p>
          </>
        )}

        {p.tab === 'zones' && d && (
          <>
            <p className="text-[12px] text-slate-300">
              Ranked by <span className="text-orange-300 font-semibold">heat × vegetation deficit</span> — measured from the thermal + NDVI bake, not guessed.
            </p>
            <button
              onClick={p.onExplainZones}
              disabled={p.aiLoading || !p.apiKey}
              className="w-full text-[12px] font-semibold rounded-lg px-3 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-40"
            >
              {p.aiLoading ? 'Analyzing…' : '✨ AI: why each zone ranks here'}
            </button>
            {p.zoneExplanation && (
              <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-xl p-3 text-[12px] text-slate-200 whitespace-pre-wrap leading-relaxed">
                {p.zoneExplanation}
              </div>
            )}
            <div className="space-y-2">
              {d.priority_zones.slice(0, 10).map((z) => (
                <button
                  key={z.id}
                  onClick={() => p.onFocusZone(z)}
                  className="w-full text-left bg-white/5 hover:bg-white/10 rounded-xl p-3 transition border border-white/5"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-white text-[13px] font-bold">{z.name}</span>
                    <span className="text-orange-300 font-bold text-[13px]">{z.score}/100</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 mt-1.5">
                    <div className="bg-gradient-to-r from-yellow-400 to-red-500 h-1.5 rounded-full" style={{ width: `${z.score}%` }} />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {z.mean_temp}°C mean · {z.max_temp}°C max · NDVI {z.mean_ndvi} · {z.area_ha} ha
                  </p>
                </button>
              ))}
            </div>
          </>
        )}

        {p.tab === 'sim' && d && (
          <>
            <p className="text-[12px] text-slate-300">
              Model what an intervention would do to any spot on the map. Cooling coefficients are literature-based planning estimates; the temperatures and areas are measured.
            </p>
            <div className="bg-white/5 rounded-xl p-3 space-y-2.5">
              <div>
                <p className="text-[11px] font-semibold text-slate-300 mb-1">TARGET</p>
                {p.probe ? (
                  <button
                    onClick={() => setSimCenter({ lat: p.probe!.lat, lon: p.probe!.lon })}
                    className={`w-full text-[12px] rounded-lg px-2.5 py-2 border ${
                      simCenter ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {simCenter ? `✓ ${simCenter.lat.toFixed(3)}, ${simCenter.lon.toFixed(3)}` : `Use probed point (${p.probe.lat.toFixed(3)}, ${p.probe.lon.toFixed(3)})`}
                  </button>
                ) : (
                  <p className="text-[11px] text-slate-500">Click the globe first to pick a target point.</p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-300 mb-1">INTERVENTION</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {d.interventions.map((iv) => (
                    <button
                      key={iv.key}
                      onClick={() => setSimIntervention(iv.key)}
                      title={iv.blurb}
                      className={`text-[11px] font-semibold rounded-lg px-2 py-2 ${
                        simIntervention === iv.key ? 'bg-emerald-500/90 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {iv.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex justify-between">
                  <p className="text-[11px] font-semibold text-slate-300">RADIUS</p>
                  <p className="text-[11px] text-slate-400">{simRadius.toFixed(1)} km</p>
                </div>
                <input type="range" min={0.5} max={3} step={0.25} value={simRadius} onChange={(e) => setSimRadius(+e.target.value)} className="w-full accent-emerald-500" />
              </div>
              <div>
                <div className="flex justify-between">
                  <p className="text-[11px] font-semibold text-slate-300">TREATED COVERAGE</p>
                  <p className="text-[11px] text-slate-400">{Math.round(simCoverage * 100)}%</p>
                </div>
                <input type="range" min={0.2} max={1} step={0.1} value={simCoverage} onChange={(e) => setSimCoverage(+e.target.value)} className="w-full accent-emerald-500" />
              </div>
              <button
                onClick={() => simCenter && p.onSimulate({ centerLat: simCenter.lat, centerLon: simCenter.lon, radiusKm: simRadius, intervention: simIntervention, coverage: simCoverage })}
                disabled={!simCenter || p.simLoading}
                className="w-full text-[13px] font-bold rounded-xl px-3 py-2.5 bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40"
              >
                {p.simLoading ? 'Simulating…' : '▶ Run simulation'}
              </button>
              {p.simResult && (
                <button onClick={p.onClearSim} className="w-full text-[11px] text-slate-400 hover:text-slate-200">
                  Clear simulation
                </button>
              )}
            </div>
            {p.simResult && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-emerald-300 mb-1.5">PROJECTED OUTCOME</p>
                <p className="text-[12px] text-slate-200 leading-relaxed">{simSummary(p.simResult)}</p>
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  <Stat v={`${Math.abs(p.simResult.deltaT).toFixed(1)}°`} l="cooling" />
                  <Stat v={fmtINR(p.simResult.costInr)} l="est. cost" />
                  <Stat v={`${p.simResult.newMean.toFixed(1)}°`} l="new mean" />
                </div>
              </div>
            )}
            {p.simNarrative && (
              <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-xl p-3 text-[12px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                {p.simNarrative}
              </div>
            )}
          </>
        )}

        {p.tab === 'ai' && d && (
          <>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[11px] font-semibold text-slate-300 mb-1.5">ASK THE HEAT MAP</p>
              <div className="flex gap-1.5">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && question.trim() && p.onAsk(question.trim())}
                  placeholder="e.g. where is it hottest right now?"
                  className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-[12px] text-white placeholder:text-slate-500 outline-none focus:border-orange-500/50"
                />
                <button
                  onClick={() => question.trim() && p.onAsk(question.trim())}
                  disabled={p.aiLoading || !p.apiKey}
                  className="bg-orange-500 text-white text-[12px] font-bold rounded-lg px-3 disabled:opacity-40"
                >
                  Ask
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['Where should the city plant first?', 'How bad is the industrial belt?', 'Hottest residential pocket?'].map((q) => (
                  <button key={q} onClick={() => p.onAsk(q)} disabled={p.aiLoading || !p.apiKey}
                    className="text-[10px] bg-white/5 hover:bg-white/10 text-slate-300 rounded-full px-2.5 py-1 disabled:opacity-40">
                    {q}
                  </button>
                ))}
              </div>
            </div>
            {p.aiLoading && <p className="text-[12px] text-cyan-300 animate-pulse">Analyzing the thermal data…</p>}
            {p.aiAnswer && (
              <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-xl p-3 text-[12px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                {p.aiAnswer}
              </div>
            )}
            <button
              onClick={p.onReport}
              disabled={p.aiLoading || !p.apiKey}
              className="w-full text-[12px] font-bold rounded-xl px-3 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white hover:opacity-90 disabled:opacity-40"
            >
              📋 Generate mitigation report
            </button>
            {p.report && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[12px] text-slate-200 leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                {p.report}
              </div>
            )}
            <p className="text-[10px] text-slate-500">AI reasons over the measured Landsat bake — it cites real numbers, never invents them.</p>
          </>
        )}
      </div>

      {/* footer: key gate */}
      <div className="px-4 py-2 border-t border-white/10">
        <input
          type="password"
          value={p.apiKey}
          onChange={(e) => p.setApiKey(e.target.value)}
          placeholder="Gemini API key (for AI features)"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-slate-500 outline-none focus:border-cyan-500/50"
        />
      </div>
    </div>
  );
}

