import 'server-only';
import { escapeHtml, sendEmail } from './email';
import { eventPhase, formatWhen } from './event-info';
import { naira, percent, splitTransfer } from './money';
import {
  createCustomer,
  createDedicatedAccount,
  createSplit,
  createSubaccount,
  deactivateDedicatedAccount,
  paystackConfigured,
} from './paystack';
import { getStore } from './store';
import { cleanNarration } from './text';
import type { Planner, SprayEvent, Transfer } from './types';

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
      const domain = process.env.PAYSTACK_CUSTOMER_EMAIL_DOMAIN || 'events.dashpad.ng';
      const code = await createCustomer({
        email: `event-${event.id}@${domain}`,
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
    narration: string | null;
    paidAt?: string | null;
    processingFeeKobo?: number;
  },
): Promise<Transfer> {
  const when = t.paidAt ? new Date(t.paidAt).getTime() : Date.now();
  const outsideWindow = eventPhase({ startsAt: event.startsAt, endsAt: event.endsAt }, Number.isFinite(when) ? when : Date.now()) !== 'live';
  const split = splitTransfer(t.amountKobo, event.plannerFeeBps, event.platformFeeBps);
  const { transfer } = await getStore().insertTransfer({
    eventId: event.id,
    reference: t.reference,
    amountKobo: t.amountKobo,
    senderName: t.senderName?.trim() || null,
    senderBank: t.senderBank?.trim() || null,
    message: cleanNarration(t.narration, t.senderName),
    platformFeeKobo: split.platformFeeKobo,
    plannerFeeKobo: split.plannerFeeKobo,
    celebrantKobo: split.celebrantKobo,
    processingFeeKobo: Math.max(0, Math.round(t.processingFeeKobo ?? 0)),
    outsideWindow,
  });
  return transfer;
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
    const sent = await sendEmail({ to: planner.email, subject, html, text });
    if (!sent) throw new Error('Email not sent');
    return true;
  } catch (err) {
    console.error('Event report failed for', event.slug, err);
    if (!opts.force) await store.releaseReport(event.id);
    return false;
  }
}

export function summarise(transfers: Transfer[]) {
  const counted = transfers.filter((t) => !t.outsideWindow);
  const sum = (f: (t: Transfer) => number) => counted.reduce((s, t) => s + f(t), 0);
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
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });

  const rows = transfers
    .filter((t) => !t.outsideWindow)
    .map(
      (t) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${time(t.createdAt)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(t.senderName ?? 'Unknown')}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(t.senderBank ?? '')}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap"><b>${naira(t.amountKobo)}</b></td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(t.message ?? '')}</td></tr>`,
    )
    .join('');

  const outsideNote = s.outside.length
    ? `<p style="color:#8a4b00">${s.outside.length} transfer(s) arrived outside the event time and were not shown on screen. DashPad will contact you about them.</p>`
    : '';

  const html = `<div style="font-family:Arial,sans-serif;color:#1F0A26;max-width:680px">
<h2 style="margin:0 0 4px">${escapeHtml(event.title)}</h2>
<p style="margin:0 0 16px;color:#5E4A66">${escapeHtml(formatWhen(event.startsAt))} – ${escapeHtml(formatWhen(event.endsAt))}</p>
<p>Hi ${escapeHtml(planner.name)}, here is who sprayed at your event.</p>
<table style="border-collapse:collapse;margin:12px 0">
<tr><td style="padding:4px 12px 4px 0">Total sprayed</td><td><b>${naira(s.totalKobo)}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0">Number of sprays</td><td><b>${s.count}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0">Different senders</td><td><b>${s.senderCount}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0">Your earnings (${percent(event.plannerFeeBps)})</td><td><b>${naira(s.plannerKobo)}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0">Paid to ${escapeHtml(event.celebrantName)}</td><td><b>${naira(s.celebrantKobo)}</b></td></tr>
</table>
<p style="color:#5E4A66">Payouts reach your account and ${escapeHtml(event.celebrantName)}’s account within 2 business days of each spray.</p>
${outsideNote}
<table style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="background:#F7F0F9;text-align:left"><th style="padding:6px 8px">Time</th><th style="padding:6px 8px">Sender</th><th style="padding:6px 8px">Bank</th><th style="padding:6px 8px;text-align:right">Amount</th><th style="padding:6px 8px">Message</th></tr>
${rows || '<tr><td colspan="5" style="padding:8px">No sprays were received.</td></tr>'}
</table>
<p style="color:#5E4A66;font-size:13px;margin-top:16px">Sender names come from their bank accounts. On the big screen every spray was anonymous.</p>
</div>`;

  const text = [
    `${event.title}`,
    `Total sprayed: ${naira(s.totalKobo)} from ${s.count} sprays (${s.senderCount} different senders)`,
    `Your earnings: ${naira(s.plannerKobo)}`,
    'Payouts arrive within 2 business days of each spray.',
    '',
    ...transfers.filter((t) => !t.outsideWindow).map((t) => `${time(t.createdAt)}  ${t.senderName ?? 'Unknown'}  ${naira(t.amountKobo)}  ${t.message ?? ''}`),
  ].join('\n');

  return { subject, html, text };
}

// ---------- The big screen ----------

export type ScreenTransfer = { id: number; amountKobo: number; message: string | null; createdAt: string };

export type ScreenFeed = {
  event: {
    title: string;
    celebrantName: string;
    recipientLabel: string;
    theme: string;
    photos: string[];
    phase: 'upcoming' | 'live' | 'ended';
    startsAt: string;
    endsAt: string;
    paused: boolean;
    bigSprayKobo: number;
    accountNumber: string | null;
    accountBank: string | null;
    accountName: string | null;
  };
  stats: { totalKobo: number; count: number };
  /** Latest transfers, oldest first. No sender names, ever. */
  recent: ScreenTransfer[];
};

export async function screenFeed(event: SprayEvent): Promise<ScreenFeed> {
  const store = getStore();
  const [stats, transfers] = await Promise.all([store.eventStats(event.id), store.listTransfers(event.id, 40)]);
  return {
    event: {
      title: event.title,
      celebrantName: event.celebrantName,
      recipientLabel: event.recipientLabel,
      theme: event.theme,
      photos: event.photos ?? [],
      phase: eventPhase(event),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      paused: event.paused,
      bigSprayKobo: event.bigSprayKobo,
      accountNumber: event.setupStatus === 'ready' ? event.accountNumber : null,
      accountBank: event.setupStatus === 'ready' ? event.accountBank : null,
      accountName: event.setupStatus === 'ready' ? event.accountName : null,
    },
    stats,
    recent: transfers
      .filter((t) => !t.outsideWindow)
      .slice(0, 30)
      .map((t) => ({ id: t.id, amountKobo: t.amountKobo, message: t.hidden ? null : t.message, createdAt: t.createdAt }))
      .reverse(),
  };
}
