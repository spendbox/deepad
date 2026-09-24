import 'server-only';
import { headers } from 'next/headers';

export type PaymentMode = 'demo' | 'paystack-test' | 'paystack-live';

/**
 * demo          -> no Paystack key: fake account numbers, "simulate transfer" buttons.
 * paystack-test -> a Paystack TEST secret key (sk_test_...): real API, fake money.
 * paystack-live -> a Paystack LIVE secret key (sk_live_...): real money.
 */
export function paymentMode(): PaymentMode {
  const key = process.env.PAYSTACK_SECRET_KEY ?? '';
  if (key.startsWith('sk_live_')) return 'paystack-live';
  if (key.startsWith('sk_test_')) return 'paystack-test';
  return 'demo';
}

/** Fake "the money arrived" buttons exist only when no real money can move. */
export function simulateAllowed(): boolean {
  return paymentMode() !== 'paystack-live';
}

export function storeIsPractice(): boolean {
  return !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** The public web address of the site, used in QR codes. */
export async function siteUrl(): Promise<string> {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL;
  if (fixed) return fixed.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
