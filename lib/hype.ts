// The hype line: the screen cheering every spray. Bigger sprays get bigger
// lines. Planners can write their own ("{name}" becomes the celebrant's name).

export const HYPE_TIERS: { minNaira: number; lines: string[] }[] = [
  { minNaira: 50_000, lines: ['Chairman don land!', 'Odogwu spray!', 'The money is too much!', 'Big man ting!'] },
  { minNaira: 20_000, lines: ['Correct spray!', 'This one choke!', 'Odogwu don land!', 'Na so e suppose be!'] },
  { minNaira: 5_000, lines: ['Money don land!', 'Omo, e choke!', 'Spray am well!', 'Enjoyment dey!'] },
  { minNaira: 0, lines: ['Love don land!', 'Every naira count!', 'Keep am coming!', 'Big love for {name}!'] },
];

/** A sample of our lines, e.g. to show planners what the defaults look like. */
export const DEFAULT_HYPE_LINES = HYPE_TIERS.map((t) => t.lines[0]).concat(HYPE_TIERS.map((t) => t.lines[1]));

export const MAX_HYPE_LINES = 30;
export const MAX_HYPE_LENGTH = 60;

/** The planner's own lines, cleaned (empty = use ours). */
export function hypeLinesFor(lines: string[] | null | undefined): string[] {
  return (lines ?? []).map((l) => l.trim()).filter(Boolean);
}

/** Always the same line for the same spray, but varied across sprays. */
export function hypeFor(amountKobo: number, sprayId: number, ownLines: string[], celebrantName: string): string {
  const naira = amountKobo / 100;
  const lines = ownLines.length ? ownLines : (HYPE_TIERS.find((t) => naira >= t.minNaira) ?? HYPE_TIERS[HYPE_TIERS.length - 1]).lines;
  return lines[Math.abs(sprayId * 7 + 3) % lines.length].replaceAll('{name}', celebrantName);
}
