// Fun lines for the big screen when a spray arrives without a message, so the
// screen never feels empty. "{name}" becomes the celebrant's name.

export const DEFAULT_HYPE_LINES = [
  'Owo nla! The money is landing!',
  'Spray am well well!',
  'More money, more blessings!',
  'Big love for {name}!',
  'Na so! Keep it coming!',
  'Omo! See enjoyment!',
  'Correct spray! Who is next?',
  'The dance floor is on fire!',
];

export const MAX_HYPE_LINES = 30;
export const MAX_HYPE_LENGTH = 60;

/** The planner's own lines, or the defaults; with the celebrant's name filled in. */
export function hypeLinesFor(lines: string[] | null | undefined, celebrantName: string): string[] {
  const own = (lines ?? []).map((l) => l.trim()).filter(Boolean);
  return (own.length ? own : DEFAULT_HYPE_LINES).map((l) => l.replaceAll('{name}', celebrantName));
}

/** Always the same line for the same spray, but varied across sprays. */
export function pickHypeLine(lines: string[], sprayId: number): string | null {
  if (!lines.length) return null;
  return lines[Math.abs(sprayId * 7 + 3) % lines.length];
}
