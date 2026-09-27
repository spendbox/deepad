import { NextResponse } from 'next/server';
import { checkIntentPaid, wadState } from '@/lib/events';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The guest's phone asks every few seconds: has my money landed? And how much of my wad is left?
export async function GET(_req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const store = getStore();
  const intent = await store.getIntent(ref);
  if (!intent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const paid = await checkIntentPaid(intent);
  const fresh = paid && intent.status !== 'paid' ? (await store.getIntent(ref)) ?? intent : intent;
  return NextResponse.json(wadState(fresh, paid), { headers: { 'Cache-Control': 'no-store' } });
}
