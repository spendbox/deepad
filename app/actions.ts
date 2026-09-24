'use server';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ADMIN_COOKIE, checkAdminPassword, makeAdminToken } from '@/lib/auth';
import { EVENT_TYPES, isEventType, MAX_EVENT_HOURS } from '@/lib/event-info';
import { escapeHtml, sendEmail } from '@/lib/email';
import { checkPaystackForTransfers, recleanMessages, sendEventReport, setupEventPayments } from '@/lib/events';
import { deactivateDedicatedAccount, paystackConfigured } from '@/lib/paystack';
import { clampPlannerFeeBps, MAX_PLANNER_FEE_BPS, PLATFORM_FEE_BPS } from '@/lib/money';
import { hashPassword, verifyPassword } from '@/lib/passwords';
import { endPlannerSession, requireAdmin, requirePlanner, startPlannerSession } from '@/lib/session';
import { siteUrl } from '@/lib/site';
import { slugProblem } from '@/lib/slug';
import { MAX_HYPE_LENGTH, MAX_HYPE_LINES } from '@/lib/hype';
import { getStore } from '@/lib/store';
import { cleanDisplayName, cleanMessage } from '@/lib/text';
import { isThemeId } from '@/lib/themes';
import type { Planner, SprayEvent } from '@/lib/types';

type FormState = { error?: string; ok?: string } | null;

const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const normEmail = (s: string) => s.trim().toLowerCase();

// ---------- Planner accounts ----------

export async function signup(_prev: FormState, form: FormData): Promise<FormState> {
  const name = cleanDisplayName(str(form, 'name'));
  const email = normEmail(str(form, 'email'));
  const phone = str(form, 'phone').replace(/[^\d+]/g, '');
  const password = String(form.get('password') ?? '');

  if (name.length < 2) return { error: 'Please enter your name or business name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Please enter a valid email address.' };
  if (phone.replace(/\D/g, '').length < 10) return { error: 'Please enter your phone number.' };
  if (password.length < 8) return { error: 'Your password needs at least 8 characters.' };

  const store = getStore();
  if (await store.getPlannerByEmail(email)) return { error: 'An account with that email already exists. Please log in.' };

  let planner: Planner;
  try {
    planner = await store.createPlanner({
      name,
      email,
      phone,
      passwordHash: await hashPassword(password),
      bankCode: null,
      bankName: null,
      accountNumber: null,
      accountName: null,
      paystackSubaccount: null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_TAKEN') return { error: 'An account with that email already exists. Please log in.' };
    throw err;
  }
  if (!(await startPlannerSession(planner))) return { error: 'Sign-in is not set up yet (ADMIN_SESSION_SECRET missing).' };
  redirect('/dashboard/profile?welcome=1');
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = normEmail(str(form, 'email'));
  const password = String(form.get('password') ?? '');
  const planner = await getStore().getPlannerByEmail(email);
  // Same message either way, so nobody can find out which emails have accounts.
  if (!planner || !(await verifyPassword(password, planner.passwordHash))) {
    return { error: 'That email and password don’t match.' };
  }
  if (!(await startPlannerSession(planner))) return { error: 'Sign-in is not set up yet (ADMIN_SESSION_SECRET missing).' };
  redirect('/dashboard');
}

export async function logout() {
  await endPlannerSession();
  redirect('/');
}

// ---------- Forgot password ----------

const RESET_MINUTES = 60;
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = normEmail(str(form, 'email'));
  const done = { ok: `If ${email} has a DashPad account, we’ve emailed a link to reset the password. It works for ${RESET_MINUTES} minutes.` };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Please enter a valid email address.' };

  const store = getStore();
  const planner = await store.getPlannerByEmail(email);
  // Same answer whether or not the account exists, so nobody can find out who has one.
  if (!planner) return done;

  // At most one email every 2 minutes per account.
  const last = await store.latestPasswordReset(planner.id);
  if (last && !last.usedAt && Date.now() - new Date(last.createdAt).getTime() < 120_000) return done;

  const token = randomBytes(32).toString('base64url');
  await store.createPasswordReset({
    plannerId: planner.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000).toISOString(),
  });
  const link = `${await siteUrl()}/reset-password?token=${token}`;
  const sent = await sendEmail({
    to: planner.email,
    subject: 'Reset your DashPad password',
    text: `Hi ${planner.name},\n\nReset your DashPad password here (works for ${RESET_MINUTES} minutes):\n${link}\n\nIf you didn’t ask for this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#1F0A26;max-width:520px">
<p>Hi ${escapeHtml(planner.name)},</p>
<p>Tap the button to choose a new DashPad password. The link works for ${RESET_MINUTES} minutes.</p>
<p><a href="${link}" style="display:inline-block;background:#1F0A26;color:#F2B437;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Reset my password</a></p>
<p style="color:#5E4A66;font-size:13px">If you didn’t ask for this, you can ignore this email. Your password won’t change.</p></div>`,
  });
  if (!sent) {
    // Cancel the unsent link so the planner can try again straight away.
    const latest = await store.latestPasswordReset(planner.id);
    if (latest) await store.markPasswordResetUsed(latest.id);
    return { error: 'We couldn’t send the email right now. Please try again in a few minutes.' };
  }
  return done;
}

export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const token = str(form, 'token');
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return { error: 'Your new password needs at least 8 characters.' };

  const store = getStore();
  const reset = token ? await store.findPasswordReset(hashToken(token)) : null;
  if (!reset || reset.usedAt || new Date(reset.expiresAt).getTime() < Date.now()) {
    return { error: 'This reset link has expired or was already used. Please ask for a new one.' };
  }
  if (!(await store.markPasswordResetUsed(reset.id))) return { error: 'This reset link was already used.' };
  // Changing the password also logs out every other device.
  const planner = await store.updatePlanner(reset.plannerId, { passwordHash: await hashPassword(password) });
  await startPlannerSession(planner);
  redirect('/dashboard');
}

/** The planner's own bank account, where their cut is paid. */
export async function savePayoutAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const planner = await requirePlanner();
  const accountNumber = str(form, 'accountNumber').replace(/\D/g, '');
  const bankName = str(form, 'bankName');
  const accountName = str(form, 'accountName');
  if (accountNumber.length !== 10) return { error: 'Enter your 10-digit account number.' };
  if (!bankName) return { error: 'Choose your bank.' };
  if (!accountName) return { error: 'We need the name on the account.' };

  const changed = accountNumber !== planner.accountNumber || str(form, 'bankCode') !== (planner.bankCode ?? '');
  await getStore().updatePlanner(planner.id, {
    name: cleanDisplayName(str(form, 'name')) || planner.name,
    phone: str(form, 'phone').replace(/[^\d+]/g, '') || planner.phone,
    bankCode: str(form, 'bankCode') || null,
    bankName,
    accountNumber,
    accountName,
    // A new bank account needs a new Paystack subaccount for future events.
    ...(changed ? { paystackSubaccount: null } : {}),
  });
  revalidatePath('/dashboard');
  if (form.get('next') === 'dashboard') redirect('/dashboard');
  return { ok: 'Saved.' };
}

// ---------- Events ----------

export type NewEventInput = {
  slug: string;
  photos: string[];
  eventType: string;
  celebrantName: string;
  title: string;
  recipientLabel: string;
  startsAt: string;
  endsAt: string;
  theme: string;
  payoutBankCode: string;
  payoutBankName: string;
  payoutAccountNumber: string;
  payoutAccountName: string;
  plannerFeePercent: number;
};

export async function createSprayEvent(input: NewEventInput): Promise<{ error: string } | { id: string }> {
  const planner = await requirePlanner();

  const celebrantName = cleanDisplayName(input.celebrantName ?? '');
  if (celebrantName.length < 2) return { error: 'Please enter who is being celebrated.' };
  const eventType = isEventType(input.eventType) ? input.eventType : 'other';
  const typeInfo = EVENT_TYPES.find((t) => t.id === eventType)!;
  const title = cleanDisplayName(input.title ?? '') || typeInfo.titleFor(celebrantName);
  const recipientLabel = cleanDisplayName(input.recipientLabel ?? '') || typeInfo.recipient;

  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: 'Please choose a start and end time.' };
  if (end <= start) return { error: 'The end time must be after the start time.' };
  if (end.getTime() < Date.now()) return { error: 'The end time has already passed.' };
  if (end.getTime() - start.getTime() > MAX_EVENT_HOURS * 3600_000) {
    return { error: `An event can run for at most ${MAX_EVENT_HOURS} hours.` };
  }

  const payoutAccountNumber = String(input.payoutAccountNumber ?? '').replace(/\D/g, '');
  if (payoutAccountNumber.length !== 10) return { error: 'Enter the 10-digit account number the money should go to.' };
  if (!input.payoutBankName) return { error: 'Choose the bank the money should go to.' };
  if (!input.payoutAccountName?.trim()) return { error: 'We need the name on that account.' };

  const plannerFeeBps = clampPlannerFeeBps(Number(input.plannerFeePercent) * 100);
  if (plannerFeeBps > MAX_PLANNER_FEE_BPS) return { error: 'Your cut can be at most 45%.' };
  if (plannerFeeBps > 0 && !planner.accountNumber) {
    return { error: 'Add your own bank account in your profile first, so we know where to pay your cut.' };
  }

  const slug = String(input.slug ?? '').trim().toLowerCase();
  const slugIssue = slugProblem(slug);
  if (slugIssue) return { error: slugIssue };
  if (await getStore().getEventBySlug(slug)) return { error: 'That event link is already taken. Please choose another.' };

  let event: SprayEvent;
  try {
    event = await getStore().createEvent({
    slug,
    photos: ownPhotos(input.photos, planner.id),
    hypeLines: [],
    plannerId: planner.id,
    eventType,
    title,
    celebrantName,
    recipientLabel,
    theme: isThemeId(input.theme) ? input.theme : 'owambe',
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    plannerFeeBps,
    platformFeeBps: PLATFORM_FEE_BPS,
    bigSprayKobo: 100_000_00,
    paused: false,
    payoutBankCode: String(input.payoutBankCode ?? ''),
    payoutBankName: String(input.payoutBankName).trim(),
    payoutAccountNumber,
    payoutAccountName: String(input.payoutAccountName).trim(),
    accountNumber: null,
    accountBank: null,
    accountName: null,
    paystackCustomerCode: null,
    paystackDvaId: null,
    paystackSplitCode: null,
    paystackPayoutSubaccount: null,
    setupStatus: 'pending',
    setupError: null,
    closedAt: null,
    reportSentAt: null,
    deletedAt: null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SLUG_TAKEN') return { error: 'That event link is already taken. Please choose another.' };
    throw err;
  }

  await setupEventPayments(event.id);
  revalidatePath('/dashboard');
  return { id: event.id };
}

async function ownEvent(eventId: string): Promise<SprayEvent> {
  const planner = await requirePlanner();
  const event = await getStore().getEventById(eventId);
  if (!event || event.plannerId !== planner.id || event.deletedAt) redirect('/dashboard');
  return event;
}

/**
 * Delete an event. Its link and account number stop working straight away.
 * If it never received money it is removed completely; if it did, it is hidden
 * from the planner but kept in DashPad's records (money must always be traceable).
 */
export async function deleteSprayEvent(eventId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const event = await ownEvent(eventId);
  if (str(form, 'confirm').toLowerCase() !== 'delete') return { error: 'Type DELETE to confirm.' };
  const store = getStore();

  if (event.paystackDvaId && paystackConfigured() && !event.closedAt) {
    try {
      await deactivateDedicatedAccount(event.paystackDvaId);
    } catch (err) {
      console.error('Could not switch off account while deleting', event.slug, err);
    }
  }

  const transfers = await store.listTransfers(event.id, 1);
  if (transfers.length === 0) {
    await Promise.all(event.photos.map((u) => store.deleteImage(u).catch(() => {})));
    await store.deleteEvent(event.id);
  } else {
    const now = new Date().toISOString();
    await store.updateEvent(event.id, {
      deletedAt: now,
      closedAt: event.closedAt ?? now,
      // Free the short link so it can be used again.
      slug: `${event.slug}-deleted-${randomBytes(3).toString('hex')}`,
    });
  }
  revalidatePath('/dashboard');
  redirect('/dashboard?deleted=1');
}

// ---------- Celebrant photos ----------

const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Only keep photos this planner uploaded through us (never outside links). */
function ownPhotos(urls: unknown, plannerId: string): string[] {
  if (!Array.isArray(urls)) return [];
  return urls
    .filter((u): u is string => typeof u === 'string')
    .filter((u) => u.startsWith('data:image/') || u.includes(`/celebrant-photos/${plannerId}/`))
    .slice(0, MAX_PHOTOS);
}

/** Upload one photo (already shrunk on the phone). Returns its public link. */
export async function uploadCelebrantPhoto(form: FormData): Promise<{ url: string } | { error: string }> {
  const planner = await requirePlanner();
  const file = form.get('photo');
  if (!(file instanceof File)) return { error: 'Please choose a photo.' };
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return { error: 'Please use a JPG, PNG or WebP photo.' };
  if (file.size > MAX_PHOTO_BYTES) return { error: 'That photo is too large (max 5 MB).' };
  try {
    const url = await getStore().uploadImage(`${planner.id}/${randomUUID()}.${ext}`, new Uint8Array(await file.arrayBuffer()), file.type);
    return { url };
  } catch (err) {
    console.error('Photo upload failed', err);
    return { error: 'The photo could not be uploaded. Please try again.' };
  }
}

export async function saveEventPhotos(eventId: string, photos: string[]): Promise<{ error?: string }> {
  const event = await ownEvent(eventId);
  const keep = ownPhotos(photos, event.plannerId);
  const removed = event.photos.filter((u) => !keep.includes(u));
  await getStore().updateEvent(eventId, { photos: keep });
  await Promise.all(removed.map((u) => getStore().deleteImage(u).catch(() => {})));
  revalidatePath(`/dashboard/events/${eventId}`);
  return {};
}

export async function retrySetup(eventId: string) {
  await ownEvent(eventId);
  await setupEventPayments(eventId);
  revalidatePath(`/dashboard/events/${eventId}`);
}

export async function setPaused(eventId: string, paused: boolean) {
  await ownEvent(eventId);
  await getStore().updateEvent(eventId, { paused });
  revalidatePath(`/dashboard/events/${eventId}`);
}

export async function setTransferHidden(eventId: string, transferId: number, hidden: boolean) {
  await ownEvent(eventId);
  await getStore().setTransferHidden(eventId, transferId, hidden);
  revalidatePath(`/dashboard/events/${eventId}`);
}

export async function saveEventSettings(eventId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const event = await ownEvent(eventId);
  const theme = str(form, 'theme');
  const big = Number(str(form, 'bigSprayNaira').replace(/[^\d]/g, ''));
  const endsAtRaw = str(form, 'endsAt');
  const patch: Partial<SprayEvent> = {};
  if (isThemeId(theme)) patch.theme = theme;
  if (Number.isFinite(big) && big >= 1000) patch.bigSprayKobo = big * 100;
  const title = cleanDisplayName(str(form, 'title'));
  if (title) patch.title = title;
  const label = cleanDisplayName(str(form, 'recipientLabel'));
  if (label) patch.recipientLabel = label;

  if (form.has('hypeLines')) {
    patch.hypeLines = String(form.get('hypeLines') ?? '')
      .split('\n')
      .map((l) => cleanMessage(l)?.slice(0, MAX_HYPE_LENGTH) ?? '')
      .filter(Boolean)
      .slice(0, MAX_HYPE_LINES);
  }

  const newSlug = str(form, 'slug').toLowerCase();
  if (newSlug && newSlug !== event.slug) {
    const issue = slugProblem(newSlug);
    if (issue) return { error: issue };
    if (await getStore().getEventBySlug(newSlug)) return { error: 'That event link is already taken.' };
    patch.slug = newSlug;
  }

  if (endsAtRaw && !event.closedAt) {
    const end = new Date(endsAtRaw);
    if (Number.isNaN(end.getTime()) || end <= new Date(event.startsAt)) return { error: 'The end time must be after the start time.' };
    if (end.getTime() - new Date(event.startsAt).getTime() > MAX_EVENT_HOURS * 3600_000) {
      return { error: `An event can run for at most ${MAX_EVENT_HOURS} hours.` };
    }
    patch.endsAt = end.toISOString();
  }
  await getStore().updateEvent(eventId, patch);
  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: 'Saved.' };
}

export async function resendReport(eventId: string, _prev: FormState): Promise<FormState> {
  const event = await ownEvent(eventId);
  const sent = await sendEventReport(event, { force: true });
  return sent ? { ok: 'Report sent to your email.' } : { error: 'We could not send the email. Please try again later.' };
}

// ---------- DashPad admin ----------

export async function adminLogin(_prev: FormState, form: FormData): Promise<FormState> {
  const token = await makeAdminToken();
  if (!token) return { error: 'The admin password has not been set up yet (ADMIN_PASSWORD).' };
  if (!(await checkAdminPassword(String(form.get('password') ?? '')))) return { error: 'That password is not right.' };
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect('/admin');
}

export async function adminLogout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect('/admin/login');
}

export async function adminCheckPaystack(eventId: string, _prev: FormState): Promise<FormState> {
  await requireAdmin();
  const event = await getStore().getEventById(eventId);
  if (!event) return { error: 'Event not found.' };
  if (!paystackConfigured()) return { error: 'PAYSTACK_SECRET_KEY is not set.' };
  if (event.setupStatus !== 'ready') return { error: 'This event has no account number yet.' };
  const found = await checkPaystackForTransfers(event, { force: true });
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: found ? `Found ${found} new payment(s) and added them.` : 'Checked Paystack: no new payments found. See the payment log below for any errors.' };
}

export async function adminRecleanMessages(eventId: string, _prev: FormState): Promise<FormState> {
  await requireAdmin();
  const event = await getStore().getEventById(eventId);
  if (!event) return { error: 'Event not found.' };
  const changed = await recleanMessages(event);
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: changed ? `Updated ${changed} message(s).` : 'All messages were already correct.' };
}

export async function adminRetrySetup(eventId: string) {
  await requireAdmin();
  await setupEventPayments(eventId);
  revalidatePath(`/admin/events/${eventId}`);
}
