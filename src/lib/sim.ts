// ─── Cool-down simulator: real math on real measurements ─────────────
// Models what an intervention would do to a chosen zone. The cooling
// coefficients are literature-based planning estimates (documented in
// data.json, NOT measurements); everything else — zone temperature,
// area, vegetation — is measured from the Landsat bake.
import type { CoolingCoeff } from './heat';
import { fmtINR } from './heat';

export interface SimInput {
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  intervention: string;
  coverage: number; // 0..1 fraction of zone treated
}

export interface SimResult {
  zoneHa: number;
  treatedHa: number;
  meanT: number;
  maxT: number;
  deltaT: number;      // projected drop (°C)
  newMean: number;
  newMax: number;
  costInr: number;
  costPerC: number;   // ₹ per °C of mean cooling
  label: string;
}

export function simulate(
  input: SimInput,
  zone: { meanT: number; maxT: number },
  coeffs: Record<string, CoolingCoeff>,
  interventions: { key: string; label: string }[],
): SimResult {
  const zoneHa = Math.PI * input.radiusKm * input.radiusKm * 100;
  const treatedHa = zoneHa * input.coverage;
  const coeff = coeffs[input.intervention];
  const label = interventions.find((i) => i.key === input.intervention)?.label ?? input.intervention;
  // Cooling scales with treated area, saturating at the literature max.
  // (deltas are negative; Math.max clamps the magnitude to max_delta)
  const deltaT = Math.max(-coeff.max_delta, coeff.delta_t_per_ha * treatedHa);
  const costInr = treatedHa * coeff.cost_inr_per_ha;
  return {
    zoneHa, treatedHa,
    meanT: zone.meanT, maxT: zone.maxT,
    deltaT,
    newMean: zone.meanT - deltaT,
    newMax: zone.maxT - deltaT * 1.15,
    costInr,
    costPerC: deltaT > 0.05 ? costInr / deltaT : Infinity,
    label,
  };
}

export function simSummary(r: SimResult): string {
  return (
    `${r.label} over ${r.treatedHa.toFixed(0)} ha ` +
    `cools the zone by ~${Math.abs(r.deltaT).toFixed(1)}°C ` +
    `(mean ${r.meanT.toFixed(1)}°C → ${r.newMean.toFixed(1)}°C), ` +
    `est. cost ${fmtINR(r.costInr)}.`
  );
}
