import 'server-only';

// Paystack API calls. Amounts are in kobo, exactly as Paystack expects.
// Docs: https://paystack.com/docs/api/

// PAYSTACK_API_BASE is only for automated testing against a pretend Paystack.
const API = process.env.PAYSTACK_API_BASE || 'https://api.paystack.co';

export function paystackConfigured(): boolean {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

export function paystackIsLive(): boolean {
  return (process.env.PAYSTACK_SECRET_KEY ?? '').startsWith('sk_live_');
}

export class PaystackError extends Error {}

async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackError('Payments are not connected yet (PAYSTACK_SECRET_KEY is missing).');
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !json?.status) {
    throw new PaystackError(json?.message ?? `Paystack request failed (${res.status})`);
  }
  return json.data as T;
}

export type Bank = { name: string; code: string };

export async function listBanks(): Promise<Bank[]> {
  const data = await call<{ name: string; code: string; active?: boolean }[]>('GET', '/bank?country=nigeria&perPage=200');
  const seen = new Set<string>();
  return data
    .filter((b) => b.active !== false && b.code && !seen.has(b.code) && seen.add(b.code))
    .map((b) => ({ name: b.name, code: b.code }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Look up the name on a bank account, so people can see they typed it right. */
export async function resolveAccount(accountNumber: string, bankCode: string): Promise<string> {
  const data = await call<{ account_name: string }>(
    'GET',
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  );
  return data.account_name;
}

/** A Paystack "subaccount" is a bank account Paystack can send a share of each payment to. */
export async function createSubaccount(opts: { businessName: string; bankCode: string; accountNumber: string; email?: string }) {
  const data = await call<{ subaccount_code: string }>('POST', '/subaccount', {
    business_name: opts.businessName.slice(0, 100),
    settlement_bank: opts.bankCode,
    account_number: opts.accountNumber,
    percentage_charge: 0,
    primary_contact_email: opts.email,
  });
  return data.subaccount_code;
}

/**
 * A split tells Paystack how to share every payment. Our main account keeps
 * whatever the shares don't cover (DashPad's 5%).
 */
export async function createSplit(opts: { name: string; shares: { subaccount: string; share: number }[] }) {
  const data = await call<{ split_code: string }>('POST', '/split', {
    name: opts.name.slice(0, 100),
    type: 'percentage',
    currency: 'NGN',
    subaccounts: opts.shares,
    // DashPad's main account pays Paystack's processing fee, out of its 5%.
    bearer_type: 'account',
  });
  return data.split_code;
}

export async function createCustomer(opts: { email: string; firstName: string; lastName: string; phone?: string }) {
  const data = await call<{ customer_code: string }>('POST', '/customer', {
    email: opts.email,
    first_name: opts.firstName.slice(0, 50),
    last_name: opts.lastName.slice(0, 50),
    phone: opts.phone || undefined,
  });
  return data.customer_code;
}

/** Give the event its own account number ("dedicated virtual account"). */
export async function createDedicatedAccount(opts: { customerCode: string; splitCode: string | null }) {
  const preferredBank = process.env.PAYSTACK_DVA_BANK || (paystackIsLive() ? 'wema-bank' : 'test-bank');
  const data = await call<{ id: number; account_number: string; account_name: string; bank?: { name?: string } }>(
    'POST',
    '/dedicated_account',
    {
      customer: opts.customerCode,
      preferred_bank: preferredBank,
      ...(opts.splitCode ? { split_code: opts.splitCode } : {}),
    },
  );
  return {
    id: String(data.id),
    accountNumber: data.account_number,
    accountName: data.account_name,
    bankName: data.bank?.name ?? 'Bank',
  };
}

/** Switch the account number off after the event, so no more money can come in. */
export async function deactivateDedicatedAccount(id: string) {
  await call('DELETE', `/dedicated_account/${encodeURIComponent(id)}`);
}

/** Paystack's number for a customer (each event has its own customer). */
export async function getCustomerId(customerCode: string): Promise<number> {
  const data = await call<{ id: number }>('GET', `/customer/${encodeURIComponent(customerCode)}`);
  return data.id;
}

export type PaystackTransaction = {
  status?: string;
  reference?: string;
  amount?: number;
  fees?: number | null;
  currency?: string;
  paid_at?: string | null;
  paidAt?: string | null;
  authorization?: {
    sender_name?: string | null;
    sender_bank?: string | null;
    narration?: string | null;
    receiver_bank_account_number?: string | null;
  } | null;
};

/**
 * Successful payments to one customer (= one event) since a given time.
 * Used as a backup in case a payment notification (webhook) never arrives.
 */
export async function listCustomerTransactions(customerId: number, fromIso: string): Promise<PaystackTransaction[]> {
  const q = new URLSearchParams({ customer: String(customerId), status: 'success', perPage: '100', from: fromIso });
  return call<PaystackTransaction[]>('GET', `/transaction?${q}`);
}

/** One payment, as Paystack has it now (sometimes more complete than the first notification). */
export async function getTransaction(id: number | string): Promise<PaystackTransaction> {
  return call<PaystackTransaction>('GET', `/transaction/${encodeURIComponent(String(id))}`);
}

export type OneTimeAccount = { accountNumber: string; bankName: string; accountName: string; expiresAt: string };

/**
 * "Pay with Transfer": a one-time account number for a single spray. The
 * transfer to it is tied to `reference`, so the guest's message always matches.
 * Using the event's customer email keeps these payments on the event's customer.
 */
export async function createOneTimeAccount(opts: {
  reference: string;
  email: string;
  amountKobo: number;
  expiresAt: Date;
  splitCode: string | null;
  metadata: Record<string, unknown>;
}): Promise<OneTimeAccount> {
  const data = await call<{
    account_number?: string;
    account_name?: string;
    bank?: { name?: string };
    account_expires_at?: string;
  }>('POST', '/charge', {
    email: opts.email,
    amount: opts.amountKobo,
    reference: opts.reference,
    bank_transfer: { account_expires_at: opts.expiresAt.toISOString() },
    ...(opts.splitCode ? { split_code: opts.splitCode } : {}),
    metadata: opts.metadata,
  });
  if (!data.account_number) throw new PaystackError('Paystack did not return an account number.');
  return {
    accountNumber: data.account_number,
    bankName: data.bank?.name ?? 'Bank',
    accountName: data.account_name ?? 'DashPad',
    expiresAt: data.account_expires_at ?? opts.expiresAt.toISOString(),
  };
}

/** Ask Paystack directly whether a payment went through (backup for missed notifications). */
export async function verifyTransaction(reference: string): Promise<PaystackTransaction> {
  return call<PaystackTransaction>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
}
