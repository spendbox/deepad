import { NextResponse } from 'next/server';
import { findNarration, recordTransfer } from '@/lib/events';
import { isValidPaystackSignature } from '@/lib/paystack-signature';
import { getStore } from '@/lib/store';
import type { NewPaymentLog } from '@/lib/types';

export const dynamic = 'force-dynamic';

type ChargeData = {
  status?: string;
  reference?: string;
  amount?: number; // kobo
  fees?: number | null; // Paystack's processing fee, kobo
  currency?: string;
  paid_at?: string | null;
  customer?: { customer_code?: string } | null;
  metadata?: { receiver_account_number?: string } | string | null;
  authorization?: {
    sender_name?: string | null;
    sender_bank?: string | null;
    narration?: string | null;
    receiver_bank_account_number?: string | null;
  } | null;
};

/**
 * Paystack tells us here the moment money lands in an event's account. Only
 * signed notifications are accepted ("no fake alerts"). Every notification is
 * written to the payment log so problems can be seen on the admin page.
 * In Paystack: Settings -> API Keys & Webhooks -> Webhook URL:
 *   https://<your-site>/api/webhooks/paystack
 */
export async function POST(req: Request) {
  const store = getStore();
  const log = (l: Omit<NewPaymentLog, 'source'>) => store.logPayment({ source: 'webhook', ...l }).catch(() => {});

  const raw = await req.text();
  const secret = process.env.PAYSTACK_SECRET_KEY ?? '';
  if (!isValidPaystackSignature(raw, req.headers.get('x-paystack-signature'), secret)) {
    await log({
      paystackEvent: null,
      reference: null,
      outcome: 'bad_signature',
      detail: secret
        ? 'The signature did not match PAYSTACK_SECRET_KEY. Is the key in Vercel from the same Paystack mode (test/live) that sent this?'
        : 'PAYSTACK_SECRET_KEY is not set in Vercel.',
      eventId: null,
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { event?: string; data?: ChargeData };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const data = payload.data;
  const kind = payload.event ?? null;
  const reference = data?.reference ?? null;
  if (kind !== 'charge.success' || !data || data.status !== 'success' || !reference) {
    await log({ paystackEvent: kind, reference, outcome: 'ignored', detail: 'Not a successful payment.', eventId: null });
    return NextResponse.json({ ok: true, ignored: true });
  }
  if (data.currency && data.currency !== 'NGN') {
    await log({ paystackEvent: kind, reference, outcome: 'ignored', detail: `Currency ${data.currency}`, eventId: null });
    return NextResponse.json({ ok: true, ignored: true });
  }
  const amountKobo = Math.round(Number(data.amount ?? 0));
  if (!(amountKobo > 0)) {
    await log({ paystackEvent: kind, reference, outcome: 'ignored', detail: 'Amount was zero.', eventId: null });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const auth = data.authorization ?? {};
  const receiver = (
    auth.receiver_bank_account_number ??
    (typeof data.metadata === 'object' ? data.metadata?.receiver_account_number : undefined) ??
    ''
  ).replace(/\D/g, '');
  const customerCode = data.customer?.customer_code ?? '';

  try {
    const event =
      (receiver ? await store.getEventByAccountNumber(receiver) : null) ??
      (customerCode ? await store.getEventByCustomerCode(customerCode) : null);
    if (!event) {
      await log({
        paystackEvent: kind,
        reference,
        outcome: 'unmatched',
        detail: `No event has account ${receiver || '(none given)'} or customer ${customerCode || '(none given)'}.`,
        eventId: null,
      });
      return NextResponse.json({ ok: true, unmatched: true });
    }
    const narration = findNarration(data);
    const { transfer, created } = await recordTransfer(event, {
      reference,
      amountKobo,
      senderName: auth.sender_name ?? null,
      senderBank: auth.sender_bank ?? null,
      narration,
      paidAt: data.paid_at ?? null,
      processingFeeKobo: Number(data.fees ?? 0) || 0,
    });
    await log({
      paystackEvent: kind,
      reference,
      outcome: created ? 'recorded' : 'duplicate',
      detail: transfer.outsideWindow
        ? 'Arrived outside the event’s start/end time, so it is NOT shown on the big screen.'
        : `₦${(amountKobo / 100).toLocaleString('en-NG')} for ${event.slug}. ${
            narration
              ? `Bank description: “${narration.slice(0, 80)}” → on screen: “${transfer.message ?? '(nothing left after removing bank codes and the sender’s name)'}”`
              : 'No description was included in Paystack’s notification.'
          }`,
      eventId: event.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // A 500 makes Paystack retry later, so a hiccup never loses a spray.
    console.error('Webhook processing failed', reference, err);
    await log({
      paystackEvent: kind,
      reference,
      outcome: 'error',
      detail: err instanceof Error ? err.message : String(err),
      eventId: null,
    });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
