import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { intentState } from '@/lib/sprays';

// The one-time account page checks this every few seconds.
export async function GET(_req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const intent = await getStore().getIntent(ref);
  if (!intent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(
    { state: intentState(intent) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
