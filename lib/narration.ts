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


const NAME_KEY = /^(sender|originator|payer|remitter|source_?account|debit_?account|from)_?(account_?)?name$/i;
const NOT_A_NAME = /\b(bank|plc|ltd|limited|transfer|trf|payment|mobile|nip|ussd|pos|ref|reference|account|dashpad|paystack)\b/i;

/** Tidy a possible name; null if it doesn't look like a person's (or a business's) name. */
function asName(raw: unknown, receivers: string[]): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').replace(/^[\s/:.,-]+|[\s/:.,-]+$/g, '').trim();
  if (name.length < 3 || name.length > 60 || !/[a-z]{2}/i.test(name) || /\d{3,}/.test(name)) return null;
  const low = name.toLowerCase();
  if (receivers.some((r) => r && (low === r.toLowerCase() || low.includes(r.toLowerCase()) || r.toLowerCase().includes(low)))) return null;
  return name;
}

/**
 * Who sent the transfer. Paystack usually gives authorization.sender_name, but
 * some banks (e.g. GTBank) often leave it empty. Then we look for a name in
 * other fields of the notification, and finally in the transfer description
 * the bank wrote, e.g. "TRF FRM JOHN DOE TO ...". Never the receiving
 * account's own name.
 */
export function findSenderName(data: unknown, receivers: string[]): string | null {
  const d = (data ?? {}) as Record<string, any>;
  const auth = (d.authorization ?? {}) as Record<string, any>;
  const direct = asName(auth.sender_name, receivers) ?? asName(d.sender_name, receivers) ?? asName(d.metadata?.sender_name, receivers);
  if (direct) return direct;

  // Any other field that is clearly the sender's name.
  let found: string | null = null;
  const seen = new Set<unknown>();
  const walk = (o: unknown, depth: number) => {
    if (found || !o || typeof o !== 'object' || depth > 4 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (found) return;
      if (NAME_KEY.test(k)) found = asName(v, receivers);
      else if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(d, 0);
  if (found) return found;

  // For bank transfers, the authorization's account name is the sender's account.
  if (/dedicated|nuban|bank/i.test(String(d.channel ?? auth.channel ?? ''))) {
    const acct = asName(auth.account_name, receivers);
    if (acct && !NOT_A_NAME.test(acct)) return acct;
  }

  // Last try: the description banks write, e.g. "MOB TRF FRM JOHN DOE TO DASHPAD", "Transfer from Ada Obi".
  for (const text of collectNarrations(d)) {
    const m = /\b(?:FRM|FROM)\s*[:/-]?\s*([A-Za-z][A-Za-z .'&-]{2,60}?)(?=\s+(?:TO|VIA|FOR|REF|ON)\b|\s*[/|:,-]|\s*$)/i.exec(text);
    const name = m ? asName(m[1], receivers) : null;
    if (name && !NOT_A_NAME.test(name) && name.split(' ').length <= 5) return name;
  }
  return null;
}

// The national (NIP) code of the SENDING bank starts a bank transfer's reference,
// e.g. "000013…" for GTBank. Used when Paystack doesn't say which bank sent it.
const NIP_BANKS: Record<string, string> = {
  '000001': 'Sterling Bank', '000002': 'Keystone Bank', '000003': 'FCMB', '000004': 'UBA', '000005': 'Access (Diamond)',
  '000006': 'Jaiz Bank', '000007': 'Fidelity Bank', '000008': 'Polaris Bank', '000009': 'Citibank', '000010': 'Ecobank',
  '000011': 'Unity Bank', '000012': 'Stanbic IBTC', '000013': 'GTBank', '000014': 'Access Bank', '000015': 'Zenith Bank',
  '000016': 'First Bank', '000017': 'Wema Bank', '000018': 'Union Bank', '000020': 'Heritage Bank', '000021': 'Standard Chartered',
  '000022': 'Suntrust Bank', '000023': 'Providus Bank', '000025': 'Titan Trust Bank', '000026': 'Taj Bank', '000027': 'Globus Bank',
  '000029': 'Lotus Bank', '000030': 'Parallex Bank', '000031': 'Premium Trust Bank', '000033': 'eNaira',
  '100004': 'OPay', '100033': 'PalmPay', '090267': 'Kuda', '090405': 'Moniepoint', '100002': 'Paga', '090110': 'VFD',
};

export function bankFromReference(reference: string | null | undefined): string | null {
  const m = /^(\d{6})\d{20,}$/.exec(reference ?? '');
  return m ? NIP_BANKS[m[1]] ?? null : null;
}
