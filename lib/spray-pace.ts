// How fast each sprayer throws on the big screen. Every note they throw is ₦100
// of what they sent, so the pace decides how long they stay spraying: small
// sprays throw slowly (and still last a good while), big ones throw fast.
// No server-only imports: used by the big screen and tested directly.

export const NAIRA_PER_NOTE = 100;
/** Nobody sprays for more than 30 minutes, however much they sent. */
export const MAX_SPRAY_MS = 30 * 60_000;
/** Even the smallest spray stays long enough to read the name. */
export const MIN_SPRAY_MS = 8000;

// Seconds between notes at these amounts (₦); in between, the pace changes smoothly.
const PACE: [naira: number, seconds: number][] = [
  [1_000, 3],
  [5_000, 2.5],
  [10_000, 1.75],
  [50_000, 1],
  [100_000, 0.6],
  [500_000, 0.5],
];

/** Time between notes, in ms, for a spray of this many naira. */
export function noteIntervalMs(naira: number): number {
  if (naira <= PACE[0][0]) return PACE[0][1] * 1000;
  for (let i = 1; i < PACE.length; i++) {
    const [n1, s1] = PACE[i];
    if (naira <= n1) {
      const [n0, s0] = PACE[i - 1];
      const k = Math.log(naira / n0) / Math.log(n1 / n0);
      return Math.round((s0 + (s1 - s0) * k) * 1000);
    }
  }
  return PACE[PACE.length - 1][1] * 1000;
}

/** How long someone keeps spraying: one ₦100 note per throw, at their pace (8 seconds to 30 minutes). */
export function sprayDurationMs(pieces: number): number {
  const notes = Math.max(1, pieces);
  return Math.min(MAX_SPRAY_MS, Math.max(MIN_SPRAY_MS, notes * noteIntervalMs(notes * NAIRA_PER_NOTE)));
}
