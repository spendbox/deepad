import { NextResponse } from 'next/server';
import { throwFromPhone } from '@/lib/events';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The guest threw notes from their wad: {"add": {"500": 3}}. The big screen shows them flying.
export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const intent = await getStore().getIntent(ref);
  if (!intent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { add?: Record<string, unknown> };
  const result = await throwFromPhone(intent, body.add && typeof body.add === 'object' ? body.add : {});
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
