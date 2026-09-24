import { NextResponse } from 'next/server';
import { simulateAllowed } from '@/lib/config';
import { getStore } from '@/lib/store';
import { confirmQrSpray } from '@/lib/sprays';

// TEST MODE ONLY: pretend the guest's transfer arrived. Switched off
// automatically when a live Paystack key is in use.
export async function POST(_req: Request, ctx: { params: Promise<{ ref: string }> }) {
  if (!simulateAllowed()) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  const { ref } = await ctx.params;
  const intent = await getStore().getIntent(ref);
  if (!intent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const spray = await confirmQrSpray(intent, { paidKobo: intent.totalKobo });
  return NextResponse.json({ ok: true, sprayId: spray.id });
}
