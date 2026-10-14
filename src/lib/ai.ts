// ─── HeatScan AI: judgment on measurements, never decoration ──────────
// Every prompt is grounded on the Landsat bake. The model explains and
// reasons; it never invents temperatures, areas, or costs.
import type { HeatData, ZoneStat, ProbeResult } from './heat';
import { fmtINR } from './heat';
import type { SimResult } from './sim';

const MODEL = 'gemini-3.5-flash-lite';

async function callGemini(apiKey: string, prompt: string, maxTokens = 800): Promise<string> {
  const r = await fetch(`/api/gemini?key=${encodeURIComponent(apiKey)}&model=${MODEL}&maxTokens=${maxTokens}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: maxTokens },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const d = await r.json();
  return (d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '').trim();
}

function dataContext(data: HeatData): string {
  const s = data.stats;
  const zones = data.priority_zones.slice(0, 8).map(
    (z) => `- ${z.name} @(${z.lat},${z.lon}): score ${z.score}/100, mean ${z.mean_temp}°C, max ${z.max_temp}°C, NDVI ${z.mean_ndvi}, area ${z.area_ha} ha`,
  ).join('\n');
  const hot = data.hotspots.slice(0, 5).map(
    (h, i) => `#${i + 1} @(${h.lat},${h.lon}): peak ${h.tmax}°C, mean ${h.tmean}°C, ${h.area_ha} ha`,
  ).join('\n');
  return (
    `Landsat 9 surface temperature, Nashik, ${data.date} (30m resolution).\n` +
    `Scene stats: min ${s.min}°C, max ${s.max}°C, mean ${s.mean}°C, p95 ${s.p95}°C. UHI intensity ${data.uhi_intensity}°C.\n` +
    `Priority zones (heat × vegetation-deficit score):\n${zones}\n` +
    `Hottest clusters:\n${hot}`
  );
}

/** Grounded Q&A: answers strictly from the measured data. */
export async function askHeat(
  apiKey: string, data: HeatData, question: string, probe: ProbeResult | null,
): Promise<string> {
  const probeLine = probe?.temp != null
    ? `The user clicked @ a point measuring ${probe.temp.toFixed(1)}°C, NDVI ${probe.ndvi?.toFixed(2)}, priority ${probe.priority?.toFixed(0)}/100.`
    : 'The user has not probed a point.';
  const prompt =
    `You are HeatScan's thermal analyst for Nashik, India. Answer ONLY from the measured data below. ` +
    `If the question can't be answered from this data, say so in one sentence — never invent numbers.\n\n` +
    `${dataContext(data)}\n${probeLine}\n\n` +
    `Question: ${question}\n\n` +
    `Rules: cite actual numbers from the data. Keep it under 120 words. Plain text, no markdown headers.`;
  return callGemini(apiKey, prompt, 500);
}

/** One line per priority zone: why it ranks where it does. */
export async function explainZones(apiKey: string, zones: ZoneStat[]): Promise<string> {
  const lines = zones.slice(0, 6).map(
    (z) => `${z.name}: score ${z.score}, mean ${z.mean_temp}°C / max ${z.max_temp}°C, NDVI ${z.mean_ndvi}, ${z.area_ha} ha`,
  ).join('\n');
  const prompt =
    `You are HeatScan's thermal analyst. For each priority zone below (ranked by heat × vegetation-deficit), ` +
    `write exactly one sharp sentence explaining WHY it ranks there — reference its temperature and NDVI numbers. ` +
    `No generic greening advice.\n\n${lines}`;
  return callGemini(apiKey, prompt, 600);
}

/** Narrate a simulation result: what it means, one caveat. */
export async function narrateSim(
  apiKey: string, data: HeatData, sim: SimResult, intervention: string, radiusKm: number,
): Promise<string> {
  const prompt =
    `You are HeatScan's thermal analyst. A user simulated "${intervention}" over a ${radiusKm} km radius zone ` +
    `in Nashik (measured mean ${sim.meanT.toFixed(1)}°C, max ${sim.maxT.toFixed(1)}°C on ${data.date}).\n` +
    `Model output: projected cooling ${sim.deltaT.toFixed(1)}°C (mean → ${sim.newMean.toFixed(1)}°C), ` +
    `treated area ${sim.treatedHa.toFixed(0)} ha, estimated cost ${fmtINR(sim.costInr)}.\n` +
    `Cooling coefficients are literature-based planning estimates, not measurements — say that once, briefly.\n` +
    `In 3 sentences: 1) is this a good use of money and why, 2) who benefits most, 3) one concrete caveat. No fluff.`;
  return callGemini(apiKey, prompt, 500);
}

/** One-click mitigation report from computed facts. */
export async function mitigationReport(apiKey: string, data: HeatData): Promise<string> {
  const zones = data.priority_zones.slice(0, 5);
  const facts = zones.map((z) => {
    const c = data.cooling_coeffs.urban_forest;
    const treatedHa = z.area_ha * 0.6;
    const dT = Math.max(-c.max_delta, c.delta_t_per_ha * treatedHa).toFixed(1);
    return `- ${z.name}: ${z.area_ha} ha at mean ${z.mean_temp}°C (NDVI ${z.mean_ndvi}). 60% urban-forest treatment ≈ ${dT}°C, est. ${fmtINR(treatedHa * c.cost_inr_per_ha)}.`;
  }).join('\n');
  const prompt =
    `You are HeatScan's thermal analyst writing a mitigation brief for Nashik's municipal planners, ` +
    `based on Landsat 9 measurements from ${data.date} (UHI intensity ${data.uhi_intensity}°C, scene mean ${data.stats.mean}°C).\n\n` +
    `Zone facts:\n${facts}\n\n` +
    `Write a crisp brief with these sections (markdown): ## Key findings (3 bullets), ## Priority actions (ranked, with the numbers), ` +
    `## What this data can't tell us (2 bullets, honest limits). Under 300 words. Numbers must match the facts exactly.`;
  return callGemini(apiKey, prompt, 1200);
}
