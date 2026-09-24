import { NextResponse } from 'next/server';
import { listBanks, paystackConfigured, type Bank } from '@/lib/paystack';

// The list of Nigerian banks for the payout account forms.
export const dynamic = 'force-dynamic';

let cache: { at: number; banks: Bank[] } | null = null;
const DAY = 86_400_000;

export async function GET() {
  if (!paystackConfigured()) return NextResponse.json({ banks: [], error: 'Payments are not connected yet.' });
  try {
    if (!cache || Date.now() - cache.at > DAY) cache = { at: Date.now(), banks: await listBanks() };
    return NextResponse.json({ banks: cache.banks }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch (err) {
    console.error('listBanks failed', err);
    return NextResponse.json({ banks: [], error: 'Could not load banks. Please try again.' }, { status: 502 });
  }
}
