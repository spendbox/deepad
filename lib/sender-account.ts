// Finding the account number a payment came FROM, inside Paystack's notification.
// Needed to send anything back to the guest (e.g. a ₦1 alert). Paystack may give
// the full 10 digits, or hide most of them. No server-only imports, so it can be tested.

const SENDER_ACCOUNT_KEY = /^(sender|originator|payer|remitter|source|debit)_?(bank_?)?(account|acct)_?(number|no|num)?$/i;

export type SenderAccount = { value: string; full: boolean };

/** The sender's account number as Paystack sent it, and whether it's the full 10 digits. */
export function findSenderAccount(data: unknown): SenderAccount | null {
  let found: string | null = null;
  const seen = new Set<unknown>();
  const walk = (o: unknown, depth: number) => {
    if (found || !o || typeof o !== 'object' || depth > 5 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (found) return;
      if ((typeof v === 'string' || typeof v === 'number') && SENDER_ACCOUNT_KEY.test(k) && String(v).trim()) found = String(v).trim();
      else if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(data, 0);
  if (!found) return null;
  return { value: found, full: /^\d{10}$/.test(found) };
}
