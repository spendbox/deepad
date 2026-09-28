import { NextResponse } from 'next/server';
import { SprayInputError, startPhoneSpray, wadState } from '@/lib/events';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// A guest tapped "Spray" on the event page on their phone: give them their own account number.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const event = await getStore().getEventBySlug(code);
  if (!event || event.deletedAt) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const clientKey = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  try {
    const intent = await startPhoneSpray(event, { amountNaira: body.amountNaira, name: body.name, message: body.message }, clientKey);
    return NextResponse.json({ reference: intent.reference, ...wadState(intent, false) });
  } catch (err) {
    if (err instanceof SprayInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('startPhoneSpray failed', err);
    return NextResponse.json(
      { error: 'We couldn’t get an account number right now. Please try again, or transfer to the account on the screen.' },
      { status: 502 },
    );
  }
}
