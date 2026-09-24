import 'server-only';
import { randomBytes } from 'node:crypto';
import { paymentMode } from './config';
import { feesInside, feesOnTop, MAX_SPRAY_NAIRA, MIN_SPRAY_NAIRA } from './money';
import { createOneTimeAccount } from './paystack';
import { getStore } from './store';
import { cleanDisplayName, cleanMessage, cleanNarration, formatSenderName } from './text';
import type { DashEvent, Spray, SprayIntent } from './types';

export const ONE_TIME_ACCOUNT_MINUTES = 30;
export const ANONYMOUS_NAME = 'Anonymous guest';

export function newReference(): string {
  return `DP${Date.now().toString(36)}${randomBytes(4).toString('hex')}`.toUpperCase();
}

export class SprayInputError extends Error {}

/** Guest tapped "Pay": check what they typed and get a one-time account number. */
export async function startSpray(
  event: DashEvent,
  input: { name: unknown; amountNaira: unknown; message: unknown; anonymous: unknown },
): Promise<SprayIntent> {
  if (event.status === 'ended') throw new SprayInputError('This event has ended. Thank you!');

  const guestName = cleanDisplayName(String(input.name ?? ''));
  if (guestName.length < 2) throw new SprayInputError('Please enter your name.');

  const amountNaira = Math.floor(Number(input.amountNaira));
  if (!Number.isFinite(amountNaira) || amountNaira < MIN_SPRAY_NAIRA) {
    throw new SprayInputError(`The smallest spray is ₦${MIN_SPRAY_NAIRA.toLocaleString('en-NG')}.`);
  }
  if (amountNaira > MAX_SPRAY_NAIRA) {
    throw new SprayInputError(`The largest single spray is ₦${MAX_SPRAY_NAIRA.toLocaleString('en-NG')}.`);
  }

  const fees = feesOnTop(amountNaira * 100, event);
  const reference = newReference();
  const expiresAt = new Date(Date.now() + ONE_TIME_ACCOUNT_MINUTES * 60_000);

  let account;
  if (paymentMode() === 'demo') {
    account = {
      accountNumber: '99' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'),
      bankName: 'Test Bank (demo)',
      accountName: `DashPad / ${event.celebrants}`,
      expiresAt: expiresAt.toISOString(),
    };
  } else {
    account = await createOneTimeAccount({
      reference,
      totalKobo: fees.totalKobo,
      expiresAt,
      splitCode: event.paystackSplitCode,
      metadata: { dashpad_event_id: event.id, dashpad_reference: reference },
    });
  }

  return getStore().createIntent({
    reference,
    eventId: event.id,
    guestName,
    message: cleanMessage(String(input.message ?? '')),
    anonymous: input.anonymous === true || input.anonymous === 'true' || input.anonymous === 'on',
    sprayKobo: fees.sprayKobo,
    feeKobo: fees.feeKobo,
    totalKobo: fees.totalKobo,
    ...account,
  });
}

/** Money for a one-time account landed. Put the spray on screen. */
export async function confirmQrSpray(
  intent: SprayIntent,
  opts: { paidKobo: number; narration?: string | null; senderName?: string | null },
): Promise<Spray> {
  const store = getStore();
  const event = await store.getEventById(intent.eventId);
  if (!event) throw new Error(`Event ${intent.eventId} missing for ${intent.reference}`);

  // If the guest sent less than asked, the fee still comes off first and the
  // screen shows only what really goes to the celebrant.
  const rateBps = event.platformFeeBps + event.mcFeeBps;
  const sprayKobo =
    opts.paidKobo >= intent.totalKobo
      ? intent.sprayKobo
      : Math.floor((opts.paidKobo * 10000) / (10000 + rateBps));
  const fees = feesOnTop(sprayKobo, event);

  const { spray } = await store.insertSpray({
    eventId: event.id,
    reference: intent.reference,
    source: 'qr',
    guestName: intent.guestName,
    displayName: intent.anonymous ? ANONYMOUS_NAME : intent.guestName,
    // The message they typed wins; otherwise use the description from their bank app.
    message: intent.message ?? cleanNarration(opts.narration, opts.senderName),
    anonymous: intent.anonymous,
    amountKobo: fees.sprayKobo,
    platformFeeKobo: fees.platformFeeKobo,
    mcFeeKobo: fees.mcFeeKobo,
    celebrantKobo: fees.celebrantKobo,
  });
  await store.markIntentPaid(intent.reference, spray.id);
  return spray;
}

/** Someone transferred straight to the event's account number (no form). */
export async function confirmDirectSpray(
  event: DashEvent,
  opts: { reference: string; amountKobo: number; senderName?: string | null; narration?: string | null },
): Promise<Spray> {
  const fees = feesInside(opts.amountKobo, event);
  const { spray } = await getStore().insertSpray({
    eventId: event.id,
    reference: opts.reference,
    source: 'direct',
    guestName: opts.senderName?.trim() || 'Unknown sender',
    displayName: formatSenderName(opts.senderName),
    message: cleanNarration(opts.narration, opts.senderName),
    anonymous: false,
    amountKobo: fees.sprayKobo,
    platformFeeKobo: fees.platformFeeKobo,
    mcFeeKobo: fees.mcFeeKobo,
    celebrantKobo: fees.celebrantKobo,
  });
  return spray;
}

/** What the big screen is allowed to know about a spray. Never the real name of an anonymous guest. */
export type ScreenSpray = {
  id: number;
  name: string;
  amountKobo: number;
  message: string | null;
  anonymous: boolean;
  createdAt: string;
};

export function toScreenSpray(s: Spray): ScreenSpray {
  return {
    id: s.id,
    name: s.anonymous ? ANONYMOUS_NAME : s.displayName,
    amountKobo: s.amountKobo,
    message: s.hidden ? null : s.message,
    anonymous: s.anonymous,
    createdAt: s.createdAt,
  };
}

export function intentState(i: SprayIntent): 'pending' | 'paid' | 'expired' {
  if (i.status === 'pending' && new Date(i.expiresAt).getTime() < Date.now()) return 'expired';
  return i.status;
}
