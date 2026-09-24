import { NextResponse } from 'next/server';
import { SprayInputError, startMessageSpray } from '@/lib/events';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Guest typed a message on their phone: give them a one-time account number for this spray.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const event = await getStore().getEventBySlug(code);
  if (!event || event.deletedAt) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const clientKey = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  try {
    const intent = await startMessageSpray(event, body, clientKey);
    return NextResponse.json({ reference: intent.reference });
  } catch (err) {
    if (err instanceof SprayInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('startMessageSpray failed', err);
    return NextResponse.json(
      { error: 'We couldn’t get an account number right now. Please try again, or transfer to the account on the big screen.' },
      { status: 502 },
    );
  }
}
