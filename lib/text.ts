// Text shown on the big screen is public, so everything here is about making
// names and messages safe and tidy before they reach the screen.

export const MAX_MESSAGE_LENGTH = 60;
export const MAX_NAME_LENGTH = 40;

// Whole words plus common endings ("fucking" is caught, the surname "Shittu"
// is not). Keep this list short and obvious; the MC can always hide a message by hand.
const BAD_WORDS = [
  'fuck', 'fuk', 'fck', 'shit', 'bitch', 'bastard', 'asshole', 'arsehole',
  'dick', 'pussy', 'cunt', 'whore', 'slut', 'nigger', 'nigga', 'motherfucker',
  'ashawo', 'ashewo', 'olosho', 'oloshi', 'prick', 'wanker', 'twat', 'bollocks',
];

const BAD_WORD_RE = new RegExp(`\\b(${BAD_WORDS.join('|')})(s|es|ing|in|ed|er|ers|y|ty|head|face|hole)?\\b`, 'gi');

/** Replace rude words with stars, keeping the first letter: "shit" -> "s***". */
export function filterProfanity(text: string): string {
  return text.replace(BAD_WORD_RE, (w) => w[0] + '*'.repeat(w.length - 1));
}

export function hasProfanity(text: string): boolean {
  BAD_WORD_RE.lastIndex = 0;
  const found = BAD_WORD_RE.test(text);
  BAD_WORD_RE.lastIndex = 0;
  return found;
}

function collapseSpaces(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCase(word: string): string {
  return word
    .toLowerCase()
    .replace(/(^|[-'])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Clean up whatever the guest typed as the name for the screen. */
export function cleanDisplayName(raw: string): string {
  return filterProfanity(collapseSpaces(raw)).slice(0, MAX_NAME_LENGTH);
}

/** Clean up a guest's message for the screen (max 60 characters). */
export function cleanMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = filterProfanity(collapseSpaces(raw)).slice(0, MAX_MESSAGE_LENGTH).trim();
  return s.length ? s : null;
}

/**
 * Bank account names arrive in capitals, e.g. "OLUWASEUN ADEBAYO".
 * We show first name plus surname initial: "Oluwaseun A.".
 * No name at all becomes "A guest".
 */
export function formatSenderName(raw: string | null | undefined): string {
  const cleaned = collapseSpaces((raw ?? '').replace(/[^\p{L}\s'-]/gu, ' '));
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 0) return 'A guest';
  const first = titleCase(parts[0]);
  if (parts.length === 1) return filterProfanity(first);
  const last = parts[parts.length - 1];
  return filterProfanity(`${first} ${last[0].toUpperCase()}.`);
}

/**
 * The description a sender types in their bank app ("narration") often comes
 * wrapped in bank jargon, e.g. "NIP FRM OLUWASEUN ADEBAYO-Happy married life"
 * or "MOB/UTO/Dance well o". We keep the guest's own words, and always remove
 * the sender's name so the big screen stays anonymous.
 */
const JARGON = /^(nip|nibss|trf|trfr|tfr|transfer|trsf|ft|mob|mobile|mb|mbanking|web|ussd|pos|inw|inward|outward|ref|app|fip|nxg|frm|from|by|via|payment|pymt|pmt)$/i;

export function cleanNarration(
  raw: string | null | undefined,
  senderName?: string | null,
): string | null {
  if (!raw) return null;
  let s = collapseSpaces(raw);

  // 1) Slash-separated pieces: drop bank codes and bare jargon pieces.
  const pieces = s.split(/\s*[\/|]\s*/).map((p) => p.trim()).filter(Boolean);
  const kept = pieces.filter((p, i) => {
    if (pieces.length > 1 && i < pieces.length - 1 && /^[A-Z0-9]{2,6}$/.test(p)) return false; // "MOB/UTO/…"
    if (/^[A-Z0-9-]{6,}$/.test(p) && /\d/.test(p)) return false; // reference codes
    if (p.split(' ').every((w) => JARGON.test(w))) return false; // "NIP", "TRF FROM"
    return true;
  });
  s = kept.join(' - ');

  // 2) The sender's name, wherever it appears (screen must stay anonymous).
  const nameWords = (senderName ?? '')
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .filter((w) => w.length >= 2);
  if (nameWords.length) {
    const re = new RegExp(`(?<![\\p{L}])(${nameWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}])`, 'giu');
    s = s.replace(re, ' ');
  }
  // Without a sender name, "FRM SOME NAME - message" still hides the capitalised name.
  s = s.replace(/^(?:[A-Z]{2,6}\s+)*(?:FRM|FROM)\s+[A-Z][A-Z .'-]*?\s*(?:[-:]|\s-\s)\s*(?=\S)/, '');

  // 3) Leading bank words ("NIP FRM", "TRANSFER FROM", "WEB TRF") and trailing "TO DASHPAD…".
  s = s.replace(/\b(?:to\s+)?dashpad\b.*$/i, ' ');
  s = s.replace(/\b\d{8,}\b/g, ' ');
  s = collapseSpaces(s);
  for (;;) {
    const m = s.match(/^([\p{L}]+)[\s:.,-]*/u);
    if (!m) break;
    const word = m[1];
    const isJargon = JARGON.test(word) && (word === word.toUpperCase() || /^(trf|tfr|nip|frm|nibss|ussd)$/i.test(word) || /^(transfer)\s+(from|frm|to)\b/i.test(s));
    if (!isJargon) break;
    s = s.slice(m[0].length);
  }

  // 4) Tidy up leftover separators and shouting.
  s = collapseSpaces(s.replace(/\s*-\s*(-\s*)+/g, ' - ')).replace(/^[\s\-:,.;/|]+|[\s\-:,;/|]+$/g, '');
  s = s.replace(/\s+(?:from|frm|by)$/i, '');
  if (!/\p{L}/u.test(s)) return null;
  if (s.length > 3 && s === s.toUpperCase()) s = s.charAt(0) + s.slice(1).toLowerCase();
  return cleanMessage(s);
}
