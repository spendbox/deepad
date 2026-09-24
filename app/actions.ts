'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ADMIN_COOKIE, checkAdminPassword, makeAdminToken } from '@/lib/auth';
import { EVENT_TYPES, isEventType, MAX_EVENT_HOURS } from '@/lib/event-info';
import { insertEventWithUniqueSlug, sendEventReport, setupEventPayments } from '@/lib/events';
import { clampPlannerFeeBps, MAX_PLANNER_FEE_BPS, PLATFORM_FEE_BPS } from '@/lib/money';
import { hashPassword, verifyPassword } from '@/lib/passwords';
import { endPlannerSession, requireAdmin, requirePlanner, startPlannerSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { cleanDisplayName } from '@/lib/text';
import { isThemeId } from '@/lib/themes';
import type { SprayEvent } from '@/lib/types';

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

  let plannerId: string;
  try {
    const planner = await store.createPlanner({
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
    plannerId = planner.id;
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_TAKEN') return { error: 'An account with that email already exists. Please log in.' };
    throw err;
  }
  if (!(await startPlannerSession(plannerId))) return { error: 'Sign-in is not set up yet (ADMIN_SESSION_SECRET missing).' };
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
  if (!(await startPlannerSession(planner.id))) return { error: 'Sign-in is not set up yet (ADMIN_SESSION_SECRET missing).' };
  redirect('/dashboard');
}

export async function logout() {
  await endPlannerSession();
  redirect('/');
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

  const event = await insertEventWithUniqueSlug({
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
  });

  await setupEventPayments(event.id);
  revalidatePath('/dashboard');
  return { id: event.id };
}

async function ownEvent(eventId: string): Promise<SprayEvent> {
  const planner = await requirePlanner();
  const event = await getStore().getEventById(eventId);
  if (!event || event.plannerId !== planner.id) redirect('/dashboard');
  return event;
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

export async function adminRetrySetup(eventId: string) {
  await requireAdmin();
  await setupEventPayments(eventId);
  revalidatePath(`/admin/events/${eventId}`);
}
