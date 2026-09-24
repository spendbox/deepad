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
 * wrapped in bank jargon such as "NIP/TRF FROM JOHN DOE/Congrats". We strip
 * the obvious bank bits so the guest's own words show on screen.
 */
export function cleanNarration(
  raw: string | null | undefined,
  senderName?: string | null,
): string | null {
  if (!raw) return null;
  let s = collapseSpaces(raw);

  // Many banks separate their own prefix from the sender's words with slashes.
  const pieces = s.split('/').map((p) => p.trim()).filter(Boolean);
  const bankish = /^(nip|nibss|trf|trfr|transfer|ft|mob|mobile|mb|mbanking|web|ussd|pos|inw|inward|outward|ref|app|fip|nxg|nip transfer|mobile transfer|mobile banking|internet banking)\b/i;
  const useful = pieces.filter((p, i) => {
    // Short capital codes before the real words, e.g. "MOB/UTO/Dance well o".
    if (i < pieces.length - 1 && /^[A-Z0-9]{2,6}$/.test(p)) return false;
    if (pieces.length > 1 && bankish.test(p) && p.split(' ').length <= 3) return false;
    if (/^(trf|transfer|tfr)\s+(from|frm|to)\b/i.test(p)) return false;
    if (/^[A-Z0-9-]{8,}$/.test(p) && /\d/.test(p)) return false; // reference codes
    if (senderName && p.toLowerCase() === senderName.toLowerCase()) return false;
    return true;
  });
  s = useful.join(' ');

  s = s
    .replace(/\b(nip|trf|tfr)\s*(from|frm)\b.*$/i, '')
    .replace(/\b\d{8,}\b/g, '')
    .replace(/^(transfer|trf|tfr)\s+(from|frm|to)\b.*$/i, '');
  s = collapseSpaces(s);
  if (senderName && s.toLowerCase() === senderName.toLowerCase()) return null;
  return cleanMessage(s);
}
