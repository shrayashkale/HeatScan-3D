// Curated Nashik-region labels: fade by zoom, never clutter.
export interface LabelDef { name: string; lat: number; lon: number; size: number; minH: number; maxH: number }

export const LABELS: LabelDef[] = [
  { name: 'Nashik', lat: 20.0059, lon: 73.7125, size: 17, minH: 0, maxH: 500_000 },
  { name: 'Nashik Road', lat: 19.9626, lon: 73.7962, size: 13, minH: 0, maxH: 120_000 },
  { name: 'Deolali', lat: 19.9495, lon: 73.8340, size: 12, minH: 0, maxH: 90_000 },
  { name: 'Gangapur', lat: 19.9700, lon: 73.6830, size: 12, minH: 0, maxH: 90_000 },
  { name: 'Mhasrul', lat: 20.0450, lon: 73.8300, size: 12, minH: 0, maxH: 90_000 },
  { name: 'Sinnar', lat: 19.8437, lon: 74.0015, size: 12, minH: 0, maxH: 150_000 },
  { name: 'Igatpuri', lat: 19.6947, lon: 73.5605, size: 12, minH: 0, maxH: 200_000 },
  { name: 'Trimbakeshwar', lat: 19.9304, lon: 73.5276, size: 12, minH: 0, maxH: 150_000 },
  { name: 'Ojhar', lat: 20.0900, lon: 73.9250, size: 11, minH: 0, maxH: 60_000 },
  { name: 'Niphad', lat: 20.0800, lon: 74.1100, size: 11, minH: 0, maxH: 200_000 },
];

export function labelAlpha(l: LabelDef, h: number): number {
  if (h < l.minH || h > l.maxH) return 0;
  // fade in near maxH, full below 60% of range
  const f = (l.maxH - h) / (l.maxH * 0.4);
  return Math.min(1, Math.max(0, f));
}
