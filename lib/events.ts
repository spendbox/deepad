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
  getCustomerId,
  listCustomerTransactions,
  paystackConfigured,
} from './paystack';
import { getStore } from './store';
export { collectNarrations } from './narration';
import { collectNarrations, pickNarration } from './narration';
import { cleanNarration } from './text';
import type { MoneyRow, Planner, SprayEvent, Transfer } from './types';
import { hypeLinesFor } from './hype';
import type { ThemeColors } from './themes';
import { buildReportPdf, reportFileName } from './report-pdf';

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
  // Seen before without a description (e.g. found by the backup check), and now we have one.
  if (!result.created && !result.transfer.message && message) {
    await store.setTransferMessage(result.transfer.id, message, rawNarration);
    result.transfer = { ...result.transfer, message, rawNarration };
  }
  return result;
}

/** Names of the event's own receiving account, which must never be shown as a guest's message. */
export function receiverNames(event: SprayEvent): string[] {
  return [event.accountName, process.env.PAYSTACK_BUSINESS_NAME, 'DashPad'].filter((n): n is string => !!n);
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
      const { created } = await recordTransfer(event, {
        reference: tx.reference,
        amountKobo,
        senderName: auth.sender_name ?? null,
        senderBank: auth.sender_bank ?? null,
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

export type ScreenTransfer = { id: number; amountKobo: number; message: string | null; createdAt: string };

export type ScreenFeed = {
  event: {
    title: string;
    celebrantName: string;
    recipientLabel: string;
    theme: string;
    themeColors: ThemeColors | null;
    photos: string[];
    /** Shown when a spray has no message. */
    hypeLines: string[];
    phase: 'upcoming' | 'live' | 'ended';
    startsAt: string;
    endsAt: string;
    paused: boolean;
    bigSprayKobo: number;
    accountNumber: string | null;
    accountBank: string | null;
    accountName: string | null;
  };
  /** Latest transfers, oldest first. No sender names and no totals, ever. */
  recent: ScreenTransfer[];
};

/**
 * What the big screen needs. `afterId` is the newest spray the screen has
 * already seen: every spray after it is included, so a burst of payments
 * arriving together is never cut short.
 */
export async function screenFeed(event: SprayEvent, afterId?: number): Promise<ScreenFeed> {
  const store = getStore();
  const latest = await store.listTransfers(event.id, 40);
  const newer = afterId != null && Number.isFinite(afterId) ? await store.listTransfersAfter(event.id, afterId, 300) : [];
  const byId = new Map([...latest, ...newer].map((t) => [t.id, t]));
  const transfers = [...byId.values()].sort((a, b) => b.id - a.id);
  return {
    event: {
      title: event.title,
      celebrantName: event.celebrantName,
      recipientLabel: event.recipientLabel,
      theme: event.theme,
      themeColors: event.themeColors ?? null,
      photos: event.photos ?? [],
      hypeLines: hypeLinesFor(event.hypeLines, event.celebrantName),
      phase: eventPhase(event),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      paused: event.paused,
      bigSprayKobo: event.bigSprayKobo,
      accountNumber: event.setupStatus === 'ready' ? event.accountNumber : null,
      accountBank: event.setupStatus === 'ready' ? event.accountBank : null,
      accountName: event.setupStatus === 'ready' ? event.accountName : null,
    },
    recent: transfers
      .filter((t) => !t.outsideWindow)
      .map((t) => ({ id: t.id, amountKobo: t.amountKobo, message: t.hidden ? null : t.message, createdAt: t.createdAt }))
      .reverse(),
  };
}
