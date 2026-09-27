import 'server-only';
import { randomBytes } from 'node:crypto';
import { cameraScreen, freshCamera } from './camera';
import { escapeHtml, sendEmail } from './email';
import { eventPhase, formatWhen } from './event-info';
import { naira, percent, splitTransfer } from './money';
import {
  createCustomer,
  createDedicatedAccount,
  createOneTimeAccount,
  createSplit,
  createSubaccount,
  deactivateDedicatedAccount,
  getCustomerId,
  getTransaction,
  listCustomerTransactions,
  paystackConfigured,
  verifyTransaction,
} from './paystack';
import { getStore } from './store';
export { collectNarrations } from './narration';
import { bankFromReference, collectNarrations, findSenderName, pickNarration } from './narration';
import { cleanDisplayName, cleanMessage, cleanNarration, senderFirstName, senderInitials } from './text';
import type { MoneyRow, Planner, SprayEvent, SprayIntent, Transfer } from './types';
import { addThrows, thrownNaira } from './wad';
import type { ThemeColors } from './themes';
import { buildReportPdf, reportFileName } from './report-pdf';
import { screenComment } from './comments';
import { aiFilterConfigured, moderateComment } from './moderation';

/** Paystack customer email for an event; its one-time accounts use the same one. */
function eventCustomerEmail(event: SprayEvent): string {
  const domain = process.env.PAYSTACK_CUSTOMER_EMAIL_DOMAIN || 'events.dashpad.ng';
  return `event-${event.id}@${domain}`;
}

// ---------- Payment setup (Paystack) ----------

/**
 * Give the event its account number and tell Paystack how to split every
 * transfer: celebrant, planner's cut, DashPad's 5%. Each step is saved, so if
 * something fails the planner can press "Try again" and it carries on.
 */
export async function setupEventPayments(eventId: string): Promise<SprayEvent> {
  const store = getStore();
  let event = await store.getEventById(eventId);
  if (!event) throw new Error('Event not found');
  if (event.setupStatus === 'ready') return event;

  if (!paystackConfigured()) {
    return store.updateEvent(event.id, {
      setupStatus: 'pending',
      setupError: 'Payments are not connected yet. DashPad will switch them on shortly.',
    });
  }

  const planner = await store.getPlannerById(event.plannerId);
  if (!planner) throw new Error('Planner not found');

  try {
    if (!event.paystackPayoutSubaccount) {
      if (!event.payoutBankCode) throw new Error('Choose the celebrant’s bank from the list.');
      const code = await createSubaccount({
        businessName: `${event.celebrantName} (${event.slug})`,
        bankCode: event.payoutBankCode,
        accountNumber: event.payoutAccountNumber,
      });
      event = await store.updateEvent(event.id, { paystackPayoutSubaccount: code });
    }

    let plannerSub: string | null = null;
    if (event.plannerFeeBps > 0) {
      plannerSub = await ensurePlannerSubaccount(planner);
    }

    if (!event.paystackSplitCode) {
      const celebrantBps = 10000 - event.platformFeeBps - event.plannerFeeBps;
      const shares = [{ subaccount: event.paystackPayoutSubaccount!, share: celebrantBps / 100 }];
      if (plannerSub) shares.push({ subaccount: plannerSub, share: event.plannerFeeBps / 100 });
      const code = await createSplit({ name: `DashPad ${event.slug}`, shares });
      event = await store.updateEvent(event.id, { paystackSplitCode: code });
    }

    if (!event.paystackCustomerCode) {
      const code = await createCustomer({
        email: eventCustomerEmail(event),
        firstName: event.celebrantName,
        lastName: 'DashPad',
        phone: planner.phone,
      });
      event = await store.updateEvent(event.id, { paystackCustomerCode: code });
    }

    if (!event.accountNumber) {
      const acct = await createDedicatedAccount({
        customerCode: event.paystackCustomerCode!,
        splitCode: event.paystackSplitCode,
      });
      event = await store.updateEvent(event.id, {
        paystackDvaId: acct.id,
        accountNumber: acct.accountNumber,
        accountName: acct.accountName,
        accountBank: acct.bankName,
      });
    }

    return store.updateEvent(event.id, { setupStatus: 'ready', setupError: null });
  } catch (err) {
    console.error('Payment setup failed for', event.slug, err);
    return store.updateEvent(event.id, {
      setupStatus: 'failed',
      setupError: err instanceof Error ? err.message : 'Payment setup failed.',
    });
  }
}

async function ensurePlannerSubaccount(planner: Planner): Promise<string> {
  if (planner.paystackSubaccount) return planner.paystackSubaccount;
  if (!planner.bankCode || !planner.accountNumber) {
    throw new Error('Add your own bank account in your profile to receive your cut.');
  }
  const code = await createSubaccount({
    businessName: planner.name,
    bankCode: planner.bankCode,
    accountNumber: planner.accountNumber,
    email: planner.email,
  });
  await getStore().updatePlanner(planner.id, { paystackSubaccount: code });
  return code;
}

// ---------- Money coming in ----------

/** A confirmed transfer to an event's account. Only these ever reach the screen. */
export async function recordTransfer(
  event: SprayEvent,
  t: {
    reference: string;
    amountKobo: number;
    senderName: string | null;
    senderBank: string | null;
    /** Possible descriptions, most likely first (see collectNarrations). */
    narrations: string[];
    paidAt?: string | null;
    processingFeeKobo?: number;
  },
): Promise<{ transfer: Transfer; created: boolean }> {
  const when = t.paidAt ? new Date(t.paidAt).getTime() : Date.now();
  const outsideWindow = eventPhase({ startsAt: event.startsAt, endsAt: event.endsAt }, Number.isFinite(when) ? when : Date.now()) !== 'live';
  const split = splitTransfer(t.amountKobo, event.plannerFeeBps, event.platformFeeBps);
  const store = getStore();
  const picked = pickNarration(t.narrations, t.senderName, receiverNames(event));
  // A spray started on the guest's phone: the message they typed there always wins.
  const intent = await store.getIntent(t.reference);
  const rawNarration = picked.raw;
  const message = intent && intent.eventId === event.id && intent.message ? intent.message : picked.message;
  const result = await store.insertTransfer({
    eventId: event.id,
    reference: t.reference,
    amountKobo: t.amountKobo,
    senderName: t.senderName?.trim() || null,
    senderBank: t.senderBank?.trim() || null,
    message,
    rawNarration,
    platformFeeKobo: split.platformFeeKobo,
    plannerFeeKobo: split.plannerFeeKobo,
    celebrantKobo: split.celebrantKobo,
    processingFeeKobo: Math.max(0, Math.round(t.processingFeeKobo ?? 0)),
    outsideWindow,
  });
  if (intent && intent.status !== 'paid') await store.markIntentPaid(intent.reference, result.transfer.id);
  // Seen before without the sender's name (the backup check often doesn't get it), and now we have it.
  const name = t.senderName?.trim();
  if (!result.created && !result.transfer.senderName && name) {
    const bank = t.senderBank?.trim() || null;
    await store.setTransferSender(result.transfer.id, name, bank);
    result.transfer = { ...result.transfer, senderName: name, senderBank: bank ?? result.transfer.senderBank };
  }
  // Seen before without a description (e.g. found by the backup check), and now we have one.
  let newComment = result.created && !!message;
  if (!result.created && !result.transfer.message && message) {
    await store.setTransferMessage(result.transfer.id, message, rawNarration);
    result.transfer = { ...result.transfer, message, rawNarration };
    newComment = true;
  }
  // A new comment for the big screen: the AI checks it first (only once per comment).
  if (newComment && message && commentsOn(event) && aiCheckOn(event) && aiFilterConfigured()) {
    const checked = await moderateComment(message);
    await store
      .setTransferModeration(result.transfer.id, checked.moderation, checked.screenMessage)
      .then(() => { result.transfer = { ...result.transfer, ...checked }; })
      .catch((err) => console.error('Saving the comment check failed (run the latest schema.sql?)', err));
  }
  return result;
}

/** The planner's switches: all on unless turned off. */
export const commentsOn = (event: Pick<SprayEvent, 'showComments'>) => event.showComments !== false;
export const aiCheckOn = (event: Pick<SprayEvent, 'aiCommentFilter'>) => event.aiCommentFilter !== false;
export const alertSoundOn = (event: Pick<SprayEvent, 'alertSound'>) => event.alertSound !== false;

/**
 * A payment came without the sender's name (some banks, e.g. GTBank, don't send it).
 * Ask Paystack for the full payment a little later, and fill the name in if it's there now.
 */
export async function senderNameLater(event: SprayEvent, transferId: number, paystackId: number | string): Promise<void> {
  if (!paystackConfigured()) return;
  for (const wait of [2000, 6000]) {
    await new Promise((r) => setTimeout(r, wait));
    const tx = await getTransaction(paystackId).catch(() => null);
    const name = tx ? findSenderName(tx, receiverNames(event)) : null;
    if (name) {
      await getStore().setTransferSender(transferId, name, tx?.authorization?.sender_bank ?? null);
      return;
    }
  }
}

/** Names of the event's own receiving account, which must never be shown as a guest's message. */
export function receiverNames(event: SprayEvent): string[] {
  return [event.accountName, process.env.PAYSTACK_BUSINESS_NAME, 'DashPad'].filter((n): n is string => !!n);
}

// ---------- Spraying from the phone (a one-time account per spray, then a wad to throw) ----------

export const ONE_TIME_MINUTES = 30;
export const MIN_SPRAY_NAIRA = 100;
export const MAX_SPRAY_NAIRA = 5_000_000;
export class SprayInputError extends Error {}

const recentStarts = new Map<string, number[]>();

/**
 * A guest tapped "Spray" on the event page on their phone: give them their own
 * account number for this spray (Paystack "Pay with Transfer"). The payment is
 * matched to them by its reference, so their name and comment always show.
 */
export async function startPhoneSpray(
  event: SprayEvent,
  input: { amountNaira: unknown; name: unknown; message: unknown },
  clientKey: string,
): Promise<SprayIntent> {
  if (eventPhase(event) !== 'live') throw new SprayInputError('Spraying is not open right now.');
  if (event.setupStatus !== 'ready' || !paystackConfigured()) {
    throw new SprayInputError('Spraying from your phone isn’t ready yet. Please transfer to the account on the screen.');
  }
  const amountNaira = Math.floor(Number(input.amountNaira));
  if (!Number.isFinite(amountNaira) || amountNaira < MIN_SPRAY_NAIRA) {
    throw new SprayInputError(`The smallest spray is ₦${MIN_SPRAY_NAIRA.toLocaleString('en-NG')}.`);
  }
  if (amountNaira > MAX_SPRAY_NAIRA) throw new SprayInputError(`The largest single spray is ₦${MAX_SPRAY_NAIRA.toLocaleString('en-NG')}.`);
  const name = cleanDisplayName(String(input.name ?? '')).slice(0, 24).trim() || null;
  const message = cleanMessage(String(input.message ?? ''));

  // A little protection against someone hammering the button.
  const now = Date.now();
  const recent = (recentStarts.get(clientKey) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 5) throw new SprayInputError('Too many tries. Please wait a minute and try again.');
  recentStarts.set(clientKey, [...recent, now]);

  const reference = `DPS${now.toString(36)}${randomBytes(5).toString('hex')}`.toUpperCase();
  const expiresAt = new Date(Math.min(now + ONE_TIME_MINUTES * 60_000, new Date(event.endsAt).getTime()));
  const account = await createOneTimeAccount({
    reference,
    email: eventCustomerEmail(event),
    amountKobo: amountNaira * 100,
    expiresAt,
    splitCode: event.paystackSplitCode,
    metadata: { dashpad_event_id: event.id, dashpad_reference: reference },
  });
  return getStore().createIntent({ reference, eventId: event.id, guestName: name, message, amountKobo: amountNaira * 100, ...account });
}

const lastVerifyAt = new Map<string, number>();

/**
 * The guest's phone asks "has my money landed?". Normally the payment
 * notification has already recorded it; if not, ask Paystack directly (at most
 * every few seconds).
 */
export async function checkIntentPaid(intent: SprayIntent): Promise<boolean> {
  if (intent.status === 'paid') return true;
  const now = Date.now();
  if (now - (lastVerifyAt.get(intent.reference) ?? 0) < 6_000) return false;
  lastVerifyAt.set(intent.reference, now);
  try {
    const tx = await verifyTransaction(intent.reference);
    if (tx.status !== 'success' || !(Number(tx.amount) > 0)) return false;
    const event = await getStore().getEventById(intent.eventId);
    if (!event) return false;
    const auth = tx.authorization ?? {};
    await recordTransfer(event, {
      reference: intent.reference,
      amountKobo: Math.round(Number(tx.amount)),
      senderName: findSenderName(tx, receiverNames(event)),
      senderBank: auth.sender_bank ?? bankFromReference(intent.reference),
      narrations: collectNarrations(tx),
      paidAt: tx.paid_at ?? tx.paidAt ?? null,
      processingFeeKobo: Number(tx.fees ?? 0) || 0,
    });
    return true;
  } catch {
    return false; // not paid yet, or Paystack busy: the phone will ask again
  }
}

/** What the guest's phone needs to know about their spray. */
export function wadState(intent: SprayIntent, paid: boolean) {
  const expired = !paid && new Date(intent.expiresAt).getTime() < Date.now();
  return {
    state: paid ? ('paid' as const) : expired ? ('expired' as const) : ('pending' as const),
    amountNaira: intent.amountKobo / 100,
    thrownNaira: thrownNaira(intent.thrown),
    accountNumber: intent.accountNumber,
    bankName: intent.bankName,
    accountName: intent.accountName,
    expiresAt: intent.expiresAt,
    name: intent.guestName ?? null,
  };
}

/** Notes the guest threw from their phone: added to their spray (never more than they paid). */
export async function throwFromPhone(intent: SprayIntent, add: Record<string, unknown>) {
  if (intent.status !== 'paid') return { thrownNaira: thrownNaira(intent.thrown), added: 0 };
  const next = addThrows(intent.thrown, add, intent.amountKobo / 100);
  if (next.added > 0) await getStore().setIntentThrown(intent.reference, next.thrown, new Date().toISOString());
  return { thrownNaira: thrownNaira(next.thrown), added: next.added };
}

/**
 * Re-read every stored description with the latest cleaning rules, e.g. after
 * learning that a bank puts the receiving account's name in the description.
 * Returns how many messages changed.
 */
export async function recleanMessages(event: SprayEvent): Promise<number> {
  const store = getStore();
  const receivers = receiverNames(event);
  let changed = 0;
  for (const t of await store.listTransfers(event.id, 100000)) {
    if (!t.rawNarration) continue;
    const message = cleanNarration(t.rawNarration, t.senderName, receivers);
    if (message !== t.message) {
      await store.setTransferMessage(t.id, message, t.rawNarration);
      // The comment changed: its old AI check no longer applies (the word filter decides now).
      if (t.moderation) await store.setTransferModeration(t.id, null, null).catch(() => {});
      changed += 1;
    }
  }
  return changed;
}

// ---------- Backup: ask Paystack directly ----------

const lastCheckAt = new Map<string, number>();
const lastErrorLogAt = new Map<string, number>();
const customerIds = new Map<string, number>();
const CHECK_EVERY_MS = 8_000;
const NAME_GRACE_MS = 40_000;

/**
 * Payment notifications (webhooks) can fail: a wrong webhook address in
 * Paystack, a blocked request, a network blip. While the big screen is open we
 * also ask Paystack for the event's latest successful payments, so every spray
 * still shows up. Recording is idempotent, so nothing is ever counted twice.
 * Returns how many new transfers were found.
 */
export async function checkPaystackForTransfers(event: SprayEvent, opts: { force?: boolean } = {}): Promise<number> {
  if (!paystackConfigured() || !event.paystackCustomerCode || event.setupStatus !== 'ready' || event.deletedAt) return 0;
  const now = Date.now();
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  if (!opts.force) {
    // Only around the event itself, and not more often than every few seconds.
    if (now < start - 3600_000 || now > end + 6 * 3600_000) return 0;
    if (now - (lastCheckAt.get(event.id) ?? 0) < CHECK_EVERY_MS) return 0;
  }
  lastCheckAt.set(event.id, now);

  const store = getStore();
  try {
    let customerId = customerIds.get(event.paystackCustomerCode);
    if (!customerId) {
      customerId = await getCustomerId(event.paystackCustomerCode);
      customerIds.set(event.paystackCustomerCode, customerId);
    }
    // Look back to a day before the start, so early transfers are found too (and kept off screen).
    const txs = await listCustomerTransactions(customerId, new Date(start - 86_400_000).toISOString());
    let found = 0;
    for (const tx of txs) {
      if (tx.status !== 'success' || !tx.reference || (tx.currency && tx.currency !== 'NGN')) continue;
      const amountKobo = Math.round(Number(tx.amount ?? 0));
      if (!(amountKobo > 0)) continue;
      const auth = tx.authorization ?? {};
      // Paystack's list often leaves out who sent it, while the payment notification includes it.
      // For a brand-new payment with no name, give the notification a moment to arrive first,
      // so the screen shows the person's name instead of "A guest".
      const paidAt = new Date(tx.paid_at ?? tx.paidAt ?? 0).getTime();
      const senderName = findSenderName(tx, receiverNames(event));
      if (!senderName && Number.isFinite(paidAt) && now - paidAt < NAME_GRACE_MS) continue;
      const { created } = await recordTransfer(event, {
        reference: tx.reference,
        amountKobo,
        senderName,
        senderBank: auth.sender_bank ?? bankFromReference(tx.reference),
        narrations: collectNarrations(tx),
        paidAt: tx.paid_at ?? tx.paidAt ?? null,
        processingFeeKobo: Number(tx.fees ?? 0) || 0,
      });
      if (created) {
        found += 1;
        await store.logPayment({
          source: 'check',
          paystackEvent: 'transaction.list',
          reference: tx.reference,
          outcome: 'recorded',
          detail: 'Found by asking Paystack directly (no webhook had arrived for it).',
          eventId: event.id,
          raw: tx,
        });
      }
    }
    return found;
  } catch (err) {
    // Log problems, but at most every 5 minutes per event so the log stays readable.
    if (opts.force || now - (lastErrorLogAt.get(event.id) ?? 0) > 300_000) {
      lastErrorLogAt.set(event.id, now);
      await store.logPayment({
        source: 'check',
        paystackEvent: 'transaction.list',
        reference: null,
        outcome: 'error',
        detail: `Could not check Paystack for ${event.slug}: ${err instanceof Error ? err.message : String(err)}`,
        eventId: event.id,
      });
    }
    return 0;
  }
}

// ---------- After the event ----------

/** Switch off the account number and email the planner their report. Safe to call many times. */
export async function closeEvent(event: SprayEvent): Promise<void> {
  const store = getStore();
  if (!event.closedAt) {
    if (event.paystackDvaId && paystackConfigured()) {
      try {
        await deactivateDedicatedAccount(event.paystackDvaId);
      } catch (err) {
        console.error('Could not deactivate account for', event.slug, err);
      }
    }
    event = await store.updateEvent(event.id, { closedAt: new Date().toISOString() });
  }
  await sendEventReport(event);
}

export async function closeDueEvents(): Promise<number> {
  const due = await getStore().listEventsToClose(new Date());
  for (const e of due) await closeEvent(e);
  return due.length;
}

export async function sendEventReport(event: SprayEvent, opts: { force?: boolean } = {}): Promise<boolean> {
  const store = getStore();
  if (!opts.force && !(await store.claimReport(event.id))) return false;
  try {
    const planner = await store.getPlannerById(event.plannerId);
    if (!planner) throw new Error('Planner missing');
    const transfers = (await store.listTransfers(event.id, 100000)).reverse();
    const { subject, html, text } = buildReport(event, planner, transfers);
    const pdf = await buildReportPdf(event, planner, transfers);
    const sent = await sendEmail({ to: planner.email, subject, html, text, attachments: [{ filename: reportFileName(event), content: pdf }] });
    if (!sent) throw new Error('Email not sent');
    return true;
  } catch (err) {
    console.error('Event report failed for', event.slug, err);
    if (!opts.force) await store.releaseReport(event.id);
    return false;
  }
}

export function summarise<T extends MoneyRow & { senderName?: string | null }>(transfers: T[]) {
  const counted = transfers.filter((t) => !t.outsideWindow);
  const sum = (f: (t: T) => number) => counted.reduce((s, t) => s + f(t), 0);
  const senders = new Set(counted.map((t) => (t.senderName ?? '').trim().toLowerCase()).filter(Boolean));
  return {
    count: counted.length,
    totalKobo: sum((t) => t.amountKobo),
    plannerKobo: sum((t) => t.plannerFeeKobo),
    celebrantKobo: sum((t) => t.celebrantKobo),
    platformKobo: sum((t) => t.platformFeeKobo),
    processingKobo: transfers.reduce((s, t) => s + (t.processingFeeKobo ?? 0), 0),
    senderCount: senders.size,
    outside: transfers.filter((t) => t.outsideWindow),
  };
}

function buildReport(event: SprayEvent, planner: Planner, transfers: Transfer[]) {
  const s = summarise(transfers);
  const subject = `Your DashPad report: ${event.title} (${naira(s.totalKobo)} sprayed)`;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#5E4A66">${k}</td><td style="padding:6px 0"><b>${v}</b></td></tr>`;

  const html = `<div style="font-family:Arial,sans-serif;color:#1F0A26;max-width:560px">
<div style="background:#1F0A26;padding:18px 22px;border-radius:14px 14px 0 0">
  <span style="font-size:22px;font-weight:bold;color:#FFF6E6">Dash</span><span style="font-size:22px;font-weight:bold;color:#F2B437">Pad</span>
</div>
<div style="border:1px solid #E3D3E8;border-top:none;border-radius:0 0 14px 14px;padding:22px">
<h2 style="margin:0 0 4px">${escapeHtml(event.title)}</h2>
<p style="margin:0 0 16px;color:#5E4A66">${escapeHtml(formatWhen(event.startsAt))} – ${escapeHtml(formatWhen(event.endsAt))}</p>
<p>Hi ${escapeHtml(planner.name)}, your event has ended. Here’s the summary. The full list of who sprayed is in the <b>attached PDF</b>.</p>
<table style="border-collapse:collapse;margin:12px 0">
${row('Total sprayed', naira(s.totalKobo))}
${row('Sprays', String(s.count))}
${row('Different senders', String(s.senderCount))}
${row(`Your earnings (${percent(event.plannerFeeBps)})`, naira(s.plannerKobo))}
${row(`Paid to ${escapeHtml(event.celebrantName)}`, naira(s.celebrantKobo))}
</table>
<p style="color:#5E4A66;font-size:13px">Payouts reach bank accounts within 2 business days of each spray.</p>
</div></div>`;

  const text = [
    `${event.title}`,
    `Total sprayed: ${naira(s.totalKobo)} from ${s.count} sprays (${s.senderCount} different senders)`,
    `Your earnings: ${naira(s.plannerKobo)}`,
    `Paid to ${event.celebrantName}: ${naira(s.celebrantKobo)}`,
    'The full list of who sprayed is in the attached PDF.',
  ].join('\n');

  return { subject, html, text };
}

// ---------- The big screen ----------

/**
 * A spray as the big screen sees it: who (first name and initials only) and
 * how big a moment to give it. Never the amount: it isn't even sent.
 */
export type ScreenTransfer = {
  id: number;
  /** e.g. "Tolu". */
  firstName: string | null;
  /** e.g. "T.M." */
  initials: string | null;
  /** What they typed in their bank app, shown under their name. Null if comments are off, it's empty, or it wasn't polite. */
  comment: string | null;
  /**
   * Sprayed from their phone: they throw the notes themselves. `thrown` counts
   * the notes thrown so far by value ({"500": 12}); `lastThrowAt` is when they last threw.
   */
  phone?: { thrown: Record<string, number>; lastThrowAt: string | null } | null;
  /** Big spray (at or over the planner's big-spray amount): gets the full-screen moment. */
  big: boolean;
  /** 1 to 4: bigger sprays stay on screen spraying a little longer. */
  weight: number;
  /**
   * How many ₦100 notes this person throws (one per ₦100 sent). Bigger sprays
   * throw faster (lib/spray-pace.ts), for at most 30 minutes. Never shown as an amount.
   */
  pieces: number;
  createdAt: string;
};

/** One ₦100 note per ₦100 sent. */
export const NAIRA_PER_PIECE = 100;
/** Enough ₦100 notes for the fastest pace to fill 30 minutes (see lib/spray-pace.ts). */
export const MAX_PIECES = 30 * 60 * 2;
export function sprayPieces(amountKobo: number): number {
  return Math.min(MAX_PIECES, Math.max(1, Math.floor(amountKobo / 100 / NAIRA_PER_PIECE)));
}

/** A line written by the planner or a guest (see SprayLine). */
export type ScreenLine = { id: string; text: string; name: string; photo: string | null; createdAt: string };

export type ScreenFeed = {
  event: {
    title: string;
    celebrantName: string;
    recipientLabel: string;
    theme: string;
    themeColors: ThemeColors | null;
    photos: string[];
    phase: 'upcoming' | 'live' | 'ended';
    startsAt: string;
    endsAt: string;
    paused: boolean;
    /** Play a bank-alert sound for each new spray. */
    alertSound: boolean;
    accountNumber: string | null;
    accountBank: string | null;
    accountName: string | null;
  };
  /** Latest transfers, oldest first. No amounts and no totals, ever. */
  recent: ScreenTransfer[];
  /** Lines to show, newest first. */
  lines: ScreenLine[];
  /**
   * A phone camera offering live video, if one is on. `mine`: this screen holds
   * the camera; `free`: no open screen holds it yet.
   */
  camera: { session: string; answered: boolean; mine: boolean; free: boolean } | null;
};

function sprayWeight(amountKobo: number): number {
  const naira = amountKobo / 100;
  return naira < 2_000 ? 1 : naira < 10_000 ? 2 : naira < 50_000 ? 3 : 4;
}

/**
 * What the big screen needs. `afterId` is the newest spray the screen has
 * already seen: every spray after it is included, so a burst of payments
 * arriving together is never cut short.
 */
export async function screenFeed(event: SprayEvent, afterId?: number, screenId?: string): Promise<ScreenFeed> {
  const store = getStore();
  const latest = await store.listTransfers(event.id, 40);
  const newer = afterId != null && Number.isFinite(afterId) ? await store.listTransfersAfter(event.id, afterId, 300) : [];
  const byId = new Map([...latest, ...newer].map((t) => [t.id, t]));
  // Sprays from guests' phones: their names and the notes they've thrown. Anyone who threw in the
  // last few minutes is included even if their payment is older than the latest 40.
  // (If the database update for phone spraying hasn't been run yet, the screen carries on without it.)
  const intents = await store.listPaidIntents(event.id, 60).catch((err) => {
    console.error('listPaidIntents failed (run the latest schema.sql?)', err);
    return [] as SprayIntent[];
  });
  const intentByTransfer = new Map(intents.filter((i) => i.transferId != null).map((i) => [i.transferId!, i]));
  const activeCutoff = Date.now() - 5 * 60_000;
  for (const i of intents) {
    if (i.transferId == null || byId.has(i.transferId) || !i.lastThrowAt || new Date(i.lastThrowAt).getTime() < activeCutoff) continue;
    const t = await store.getTransfer(i.transferId);
    if (t) byId.set(t.id, t);
  }
  const transfers = [...byId.values()].sort((a, b) => b.id - a.id);
  // Only approved lines, and plenty of them: the screen cycles through them all.
  const lines = await store.listLines(event.id, { status: ['approved'], limit: 300 });
  const cam = eventPhase(event) === 'ended' ? null : await freshCamera(event.id);
  const aiReady = aiFilterConfigured();
  const now = Date.now();
  return {
    event: {
      title: event.title,
      celebrantName: event.celebrantName,
      recipientLabel: event.recipientLabel,
      theme: event.theme,
      themeColors: event.themeColors ?? null,
      photos: event.photos ?? [],
      phase: eventPhase(event),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      paused: event.paused,
      alertSound: alertSoundOn(event),
      accountNumber: event.setupStatus === 'ready' ? event.accountNumber : null,
      accountBank: event.setupStatus === 'ready' ? event.accountBank : null,
      accountName: event.setupStatus === 'ready' ? event.accountName : null,
    },
    recent: transfers
      .filter((t) => !t.outsideWindow)
      .map((t) => {
        const intent = intentByTransfer.get(t.id);
        // The name they typed on their phone wins over the bank's.
        const who = intent?.guestName || t.senderName;
        return {
          id: t.id,
          firstName: intent?.guestName ? intent.guestName.slice(0, 20) : senderFirstName(t.senderName),
          initials: senderInitials(who),
          phone: intent ? { thrown: intent.thrown ?? {}, lastThrowAt: intent.lastThrowAt ?? null } : null,
          comment: screenComment(t, { show: commentsOn(event), ai: aiCheckOn(event), aiReady, now }),
          big: event.bigSprayKobo > 0 && t.amountKobo >= event.bigSprayKobo,
          weight: sprayWeight(t.amountKobo),
          pieces: sprayPieces(t.amountKobo),
          createdAt: t.createdAt,
        };
      })
      .reverse(),
    lines: lines.map((l) => ({ id: l.id, text: l.text, name: l.authorName, photo: l.photoUrl, createdAt: l.createdAt })),
    camera: cam
      ? (() => {
          const holder = cameraScreen(event);
          return { session: cam.sessionId, answered: !!cam.answer, mine: !!screenId && holder === screenId, free: !holder };
        })()
      : null,
  };
}
