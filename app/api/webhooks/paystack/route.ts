import { NextResponse } from 'next/server';
import { isValidPaystackSignature } from '@/lib/paystack-signature';
import { getStore } from '@/lib/store';
import { confirmDirectSpray, confirmQrSpray } from '@/lib/sprays';

export const dynamic = 'force-dynamic';

type ChargeData = {
  status?: string;
  reference?: string;
  amount?: number; // kobo
  currency?: string;
  channel?: string;
  authorization?: {
    sender_name?: string | null;
    sender_bank?: string | null;
    narration?: string | null;
    receiver_bank_account_number?: string | null;
    account_name?: string | null;
  } | null;
  metadata?: { dashpad_reference?: string } | string | null;
};

/**
 * Paystack tells us here the moment money lands. This is the ONLY way a real
 * spray reaches the screen, and only after the signature checks out.
 * Set this URL in Paystack: Settings -> API Keys & Webhooks -> Webhook URL:
 *   https://<your-site>/api/webhooks/paystack
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.PAYSTACK_SECRET_KEY ?? '';
  if (!isValidPaystackSignature(raw, req.headers.get('x-paystack-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { event?: string; data?: ChargeData };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const data = payload.data;
  if (payload.event !== 'charge.success' || !data || data.status !== 'success' || !data.reference) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  if (data.currency && data.currency !== 'NGN') {
    console.warn('Ignoring non-naira payment', data.reference, data.currency);
    return NextResponse.json({ ok: true, ignored: true });
  }

  const amountKobo = Math.round(Number(data.amount ?? 0));
  if (!(amountKobo > 0)) return NextResponse.json({ ok: true, ignored: true });

  const auth = data.authorization ?? {};
  const senderName = auth.sender_name ?? null;
  const narration = auth.narration ?? null;
  const store = getStore();

  try {
    // 1) A spray started from the guest page (one-time account number).
    const metaRef = typeof data.metadata === 'object' ? data.metadata?.dashpad_reference : undefined;
    const intent = (await store.getIntent(data.reference)) ?? (metaRef ? await store.getIntent(metaRef) : null);
    if (intent) {
      await confirmQrSpray(intent, { paidKobo: amountKobo, narration, senderName });
      return NextResponse.json({ ok: true });
    }

    // 2) A direct transfer to the event's own account number.
    const receiver = auth.receiver_bank_account_number?.replace(/\D/g, '');
    const event = receiver ? await store.getEventByAccountNumber(receiver) : null;
    if (event) {
      await confirmDirectSpray(event, { reference: data.reference, amountKobo, senderName, narration });
      return NextResponse.json({ ok: true });
    }

    console.warn('Paystack payment did not match any spray or event', data.reference);
    return NextResponse.json({ ok: true, unmatched: true });
  } catch (err) {
    // A 500 makes Paystack retry later, so a hiccup never loses a spray.
    console.error('Webhook processing failed', data.reference, err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
