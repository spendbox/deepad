// The guest's wad of notes when spraying from their phone. No server-only
// imports: used by the phone, the big screen and the server, and tested directly.

/** Notes a guest can throw, in naira. */
export const NOTE_VALUES = [100, 200, 500, 1000] as const;
export type NoteValue = (typeof NOTE_VALUES)[number];

/** Naira already thrown, from counts like {"500": 12, "100": 3}. */
export function thrownNaira(thrown: Record<string, number> | null | undefined): number {
  let total = 0;
  for (const [value, count] of Object.entries(thrown ?? {})) {
    const v = Number(value);
    if ((NOTE_VALUES as readonly number[]).includes(v) && count > 0) total += v * Math.floor(count);
  }
  return total;
}

/**
 * Add new throws to what's been thrown, never going over what was paid. Unknown
 * note values and silly counts are ignored; if the batch would go over, as many
 * as fit are kept (biggest notes first).
 */
export function addThrows(
  thrown: Record<string, number> | null | undefined,
  add: Record<string, unknown>,
  paidNaira: number,
): { thrown: Record<string, number>; added: number } {
  const next: Record<string, number> = { ...(thrown ?? {}) };
  let left = paidNaira - thrownNaira(next);
  let added = 0;
  for (const v of [...NOTE_VALUES].sort((a, b) => b - a)) {
    const want = Math.max(0, Math.min(500, Math.floor(Number(add[String(v)]) || 0)));
    const fit = Math.min(want, Math.floor(left / v));
    if (fit > 0) {
      next[String(v)] = (next[String(v)] ?? 0) + fit;
      left -= fit * v;
      added += fit;
    }
  }
  return { thrown: next, added };
}

/** The biggest note that still fits in what's left (or null when all is sprayed). */
export function biggestNoteFor(leftNaira: number, preferred: NoteValue): NoteValue | null {
  if (leftNaira >= preferred) return preferred;
  const fit = [...NOTE_VALUES].reverse().find((v) => v <= leftNaira);
  return fit ?? null;
}
