import { NextResponse } from 'next/server';
import { recordTransfer } from '@/lib/events';
import { isValidPaystackSignature } from '@/lib/paystack-signature';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type ChargeData = {
  status?: string;
  reference?: string;
  amount?: number; // kobo
  currency?: string;
  paid_at?: string | null;
  customer?: { customer_code?: string } | null;
  authorization?: {
    sender_name?: string | null;
    sender_bank?: string | null;
    narration?: string | null;
    receiver_bank_account_number?: string | null;
  } | null;
};

/**
 * Paystack tells us here the moment money lands in an event's account. This
 * is the ONLY way a spray reaches the screen, and only after the signature
 * checks out ("no fake alerts").
 * In Paystack: Settings -> API Keys & Webhooks -> Webhook URL:
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
  if (data.currency && data.currency !== 'NGN') return NextResponse.json({ ok: true, ignored: true });
  const amountKobo = Math.round(Number(data.amount ?? 0));
  if (!(amountKobo > 0)) return NextResponse.json({ ok: true, ignored: true });

  const auth = data.authorization ?? {};
  const store = getStore();
  try {
    const receiver = auth.receiver_bank_account_number?.replace(/\D/g, '');
    const event =
      (receiver ? await store.getEventByAccountNumber(receiver) : null) ??
      (data.customer?.customer_code ? await store.getEventByCustomerCode(data.customer.customer_code) : null);
    if (!event) {
      console.warn('Paystack payment did not match any event', data.reference);
      return NextResponse.json({ ok: true, unmatched: true });
    }
    await recordTransfer(event, {
      reference: data.reference,
      amountKobo,
      senderName: auth.sender_name ?? null,
      senderBank: auth.sender_bank ?? null,
      narration: auth.narration ?? null,
      paidAt: data.paid_at ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // A 500 makes Paystack retry later, so a hiccup never loses a spray.
    console.error('Webhook processing failed', data.reference, err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
