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
const JARGON = /^(nip|nibss|trf|trfr|tfr|transfer|trsf|ft|mob|mobile|mb|mbanking|web|ussd|pos|inw|inward|outward|ref|app|fip|nxg|frm|from|to|by|via|payment|pymt|pmt)$/i;

const lettersOnly = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Some banks fill the description with the RECEIVING account's name (e.g.
 * "SPENDBOX/DASHPA…", cut short) instead of what the guest typed. Remove it.
 * `receiverNames` are names of the event's own account, e.g. "SPENDBOX/DASHPAD TOLU".
 */
export function stripReceiverName(text: string, receiverNames: (string | null | undefined)[]): string {
  let s = text;
  for (const name of receiverNames) {
    if (!name) continue;
    const full = lettersOnly(name);
    if (full.length >= 4) {
      // A leading chunk whose letters match the start of the account name (banks cut it short).
      let matched = 0;
      let end = 0;
      let lastGood = 0;
      for (let i = 0; i < s.length && matched < full.length; i++) {
        const ch = s[i].toLowerCase();
        if (!/[\p{L}\p{N}]/u.test(ch)) {
          end = i + 1;
          continue;
        }
        if (ch !== full[matched]) break;
        matched += 1;
        end = i + 1;
        lastGood = end;
      }
      const atWordEnd = lastGood >= s.length || !/[\p{L}\p{N}]/u.test(s[lastGood]);
      if (lastGood && atWordEnd && (matched >= Math.min(8, full.length) || lastGood >= s.trim().length)) {
        s = s.slice(Math.max(lastGood, end > lastGood && !/\p{L}/u.test(s.slice(lastGood, end)) ? end : lastGood));
      }
    }
    // The business part (before the "/") anywhere in the text, with the cut-off bit after it.
    const business = name.split('/')[0].trim();
    if (lettersOnly(business).length >= 4) {
      const esc = business.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
      s = s.replace(new RegExp(`(?<![\\p{L}])${esc}(?![\\p{L}])(\\s*/\\s*[\\p{L}\\p{N}&' ]*)?`, 'giu'), ' ');
    }
  }
  return s;
}

export function cleanNarration(
  raw: string | null | undefined,
  senderName?: string | null,
  receiverNames: (string | null | undefined)[] = [],
): string | null {
  if (!raw) return null;
  let s = collapseSpaces(stripReceiverName(collapseSpaces(raw), receiverNames));
  if (!s) return null;

  // 1) Slash-separated pieces: drop bank codes and bare jargon pieces.
  const pieces = s.split(/\s*[\/|]\s*/).map((p) => p.trim()).filter(Boolean);
  const kept = pieces.filter((p, i) => {
    if (pieces.length > 1 && i < pieces.length - 1 && /^[A-Z0-9]{2,6}$/.test(p)) return false; // "MOB/UTO/…"
    if (/^[A-Z0-9-]{6,}$/.test(p) && /\d/.test(p)) return false; // reference codes
    if (p.split(' ').every((w) => JARGON.test(w))) return false; // "NIP", "TRF FROM"
    return true;
  });
  s = kept.join(' - ');

  // 2) Without a sender name, the bank's own "FRM SOME NAME - " in front of the message is removed.
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

  // The sender's name as the BANK added it (a piece of its own, e.g. "NIP/ADA OBI/Congrats") is removed,
  // since the screen shows their name anyway. Names the guest typed themselves stay: "Love from the Obi family".
  const nameWords = (senderName ?? '')
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .filter((w) => w.length >= 2);
  if (nameWords.length) {
    const onlyName = (chunk: string) => {
      const ws = chunk.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);
      return ws.length > 0 && ws.every((w) => nameWords.includes(w));
    };
    s = s.split(/\s+-\s+/).filter((piece) => !onlyName(piece)).join(' - ');
    const name = `(?:${nameWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
    s = s.replace(new RegExp(`^${name}(?:\\s+${name})*\\s*[-:/]\\s*(?=\\S)`, 'iu'), '');
    s = s.replace(new RegExp(`\\s*[-:/]\\s*${name}(?:\\s+${name})*$`, 'iu'), '');
    if (onlyName(s)) return null;
  }

  // 4) The bank's own default description when the guest typed nothing, e.g. OPay's "from Ada Obi".
  if (isDefaultFromName(s, senderName)) return null;

  // 5) Tidy up leftover separators and shouting.
  s = collapseSpaces(s.replace(/\s*-\s*(-\s*)+/g, ' - ')).replace(/^[\s\-:,.;/|]+|[\s\-:,;/|]+$/g, '');
  // Bank words left hanging at the end, e.g. "Happy birthday to" once "SPENDBOX/DASHPAD…" was removed.
  for (let i = 0; i < 3; i++) s = s.replace(/[\s\-:,;/|]+(?:from|frm|by|to|for|via|trf|nip)$/i, '').replace(/[\s\-:,;/|]+$/, '');
  if (/^(?:to|for|from|frm|by)$/i.test(s)) return null;
  if (!/\p{L}/u.test(s)) return null;
  if (s.length > 3 && s === s.toUpperCase()) s = s.charAt(0) + s.slice(1).toLowerCase();
  return cleanMessage(s);
}

/**
 * Some banks (e.g. OPay) fill in "from <sender's full name>" when the guest
 * types no description. That isn't a comment, so it's dropped. It counts as the
 * default when, after "from", there's only a name: 1 to 5 capitalised words,
 * at least one of them from the sender's bank name (when we know it).
 * "from Mummy", "from the Obi family" or "Enjoy! from Ada" are kept.
 */
export function isDefaultFromName(text: string, senderName?: string | null): boolean {
  const m = /^(?:(?:sent|transfer|trf|mobile transfer|opay transfer)\s+)?(?:from|frm)\s*[:\-]?\s+([\p{L}' .-]+?)[\s.]*$/iu.exec(text.trim());
  if (!m) return false;
  const words = m[1].split(/[\s.]+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  // Names only: each word starts with a capital (or the whole thing is in capitals, as banks write it).
  if (!words.every((w) => /^\p{Lu}/u.test(w))) return false;
  const nameWords = (senderName ?? '').toLowerCase().split(/[^\p{L}']+/u).filter((w) => w.length >= 2);
  if (!nameWords.length) return true;
  return words.some((w) => nameWords.includes(w.toLowerCase()));
}

/**
 * "OLUWASEUN ADEBAYO" → "O.A.": the first letters of the sender's first and
 * last names, all the big screen ever shows about who sprayed.
 */
export function senderInitials(name: string | null | undefined): string | null {
  const words = (name ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z\s'-]/g, ' ')
    .split(/[\s'-]+/)
    .filter((w) => w.length > 1 || /[A-Za-z]/.test(w));
  if (!words.length) return null;
  const first = words[0][0].toUpperCase();
  const last = words.length > 1 ? words[words.length - 1][0].toUpperCase() : '';
  return last ? `${first}.${last}.` : `${first}.`;
}

/** "OLUWASEUN ADEBAYO" → "Oluwaseun": the sender's first name, as the big screen shows it. */
export function senderFirstName(name: string | null | undefined): string | null {
  const first = (name ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z\s'-]/g, ' ')
    .trim()
    .split(/\s+/)[0];
  if (!first) return null;
  const pretty = first.toLowerCase().replace(/(^|[-'])([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase());
  return pretty.slice(0, 20);
}

export const MAX_LINE_LENGTH = 120;

/** A line for the big screen: tidy spacing, no rude words, not too long. */
export function cleanLine(text: string | null | undefined): string {
  const tidy = (text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LINE_LENGTH);
  return filterProfanity(tidy);
}
