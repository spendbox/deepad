import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { SprayInputError, startSpray } from '@/lib/sprays';

// Guest tapped "Pay ₦... by transfer": create a one-time account for this spray.
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const event = await getStore().getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  try {
    const intent = await startSpray(event, body);
    return NextResponse.json({ reference: intent.reference });
  } catch (err) {
    if (err instanceof SprayInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('startSpray failed', err);
    return NextResponse.json(
      { error: 'We could not get an account number right now. Please try again, or transfer to the account number on the big screen.' },
      { status: 502 },
    );
  }
}
