import { NextResponse } from 'next/server';
import { checkIntentPaid } from '@/lib/events';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The guest's phone asks every few seconds: has my spray landed?
export async function GET(_req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const intent = await getStore().getIntent(ref);
  if (!intent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const paid = await checkIntentPaid(intent);
  const expired = !paid && new Date(intent.expiresAt).getTime() < Date.now();
  return NextResponse.json({ state: paid ? 'paid' : expired ? 'expired' : 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
}
