import 'server-only';

// Paystack API calls. Amounts are in kobo, exactly as Paystack expects.
// Docs: https://paystack.com/docs/api/charge/ (Pay with Transfer)

const API = 'https://api.paystack.co';

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set');
  return key;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !json?.status || !json.data) {
    throw new Error(`Paystack ${path} failed: ${json?.message ?? res.status}`);
  }
  return json.data;
}

export type TransferAccount = {
  accountNumber: string;
  bankName: string;
  accountName: string;
  expiresAt: string;
};

/**
 * Ask Paystack for a one-time account number for a single spray
 * ("Pay with Transfer"). The guest's transfer to it is tied to `reference`.
 */
export async function createOneTimeAccount(opts: {
  reference: string;
  totalKobo: number;
  expiresAt: Date;
  splitCode: string | null;
  metadata: Record<string, unknown>;
}): Promise<TransferAccount> {
  const data = await call<{
    account_number: string;
    account_name?: string;
    bank?: { name?: string };
    account_expires_at?: string;
  }>('/charge', {
    // Paystack needs an email for every charge. Guests don't give one, so we use
    // a placeholder tied to the reference. Paystack's receipts go nowhere.
    email: `${opts.reference.toLowerCase()}@${process.env.PAYSTACK_GUEST_EMAIL_DOMAIN ?? 'guests.dashpad.ng'}`,
    amount: opts.totalKobo,
    reference: opts.reference,
    bank_transfer: { account_expires_at: opts.expiresAt.toISOString() },
    ...(opts.splitCode ? { split_code: opts.splitCode } : {}),
    metadata: opts.metadata,
  });
  return {
    accountNumber: data.account_number,
    bankName: data.bank?.name ?? 'Bank',
    accountName: data.account_name ?? 'DashPad',
    expiresAt: data.account_expires_at ?? opts.expiresAt.toISOString(),
  };
}
