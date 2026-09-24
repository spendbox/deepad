// Finding what the guest typed in their bank app, inside Paystack's notification.
// No server-only imports, so it can be tested directly.

import { cleanNarration } from './text.ts';

/**
 * Every place in Paystack's notification that might hold the description the
 * sender typed, most likely first. Paystack normally uses
 * authorization.narration, but some banks put the RECEIVING account's name
 * there instead, so we keep all candidates and pick the best one later.
 */
export function collectNarrations(data: unknown): string[] {
  const d = (data ?? {}) as Record<string, any>;
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim() && v.length <= 300 && !out.includes(v.trim())) out.push(v.trim());
  };
  [
    d.authorization?.narration,
    d.narration,
    d.metadata?.narration,
    d.authorization?.description,
    d.metadata?.description,
    d.description,
    d.authorization?.remark,
    d.metadata?.remark,
  ].forEach(add);
  // Anything else whose name sounds like a description.
  const seen = new Set<unknown>();
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== 'object' || depth > 4 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === 'string' && /narrat|remark|memo|descr|purpose|comment|note|reason/i.test(k)) add(v);
      if (Array.isArray(v)) {
        for (const item of v) {
          const it = item as Record<string, unknown>;
          if (it && /narrat|remark|descr|comment|note/i.test(String(it.variable_name ?? it.display_name ?? ''))) add(it.value);
        }
      }
      walk(v, depth + 1);
    }
  };
  walk(d, 0);
  return out;
}

/** Choose the candidate that still has the guest's own words after cleaning. */
export function pickNarration(
  candidates: string[],
  senderName: string | null,
  receivers: string[],
): { raw: string | null; message: string | null } {
  for (const c of candidates) {
    const message = cleanNarration(c, senderName, receivers);
    if (message) return { raw: c, message };
  }
  return { raw: candidates[0] ?? null, message: null };
}

