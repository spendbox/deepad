'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ADMIN_COOKIE, adminSessionToken, checkAdminPassword, isValidAdminToken } from '@/lib/admin-auth';
import { simulateAllowed } from '@/lib/config';
import { getStore } from '@/lib/store';
import { confirmDirectSpray, newReference } from '@/lib/sprays';
import type { EventStatus, NewEvent } from '@/lib/types';

async function requireAdmin() {
  const jar = await cookies();
  if (!(await isValidAdminToken(jar.get(ADMIN_COOKIE)?.value))) redirect('/admin/login');
}

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const ok = await checkAdminPassword(String(form.get('password') ?? ''));
  const token = await adminSessionToken();
  if (!token) return 'The admin password has not been set up yet (ADMIN_PASSWORD).';
  if (!ok) return 'That password is not right.';
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect('/admin');
}

export async function logout() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect('/admin/login');
}

// ---------- Reading the event form ----------

function text(form: FormData, key: string): string | null {
  const v = String(form.get(key) ?? '').trim();
  return v.length ? v : null;
}

function nairaToKobo(form: FormData, key: string, fallback: number): number {
  const raw = String(form.get(key) ?? '').replace(/[^\d.]/g, '');
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : fallback;
}

function percentToBps(form: FormData, key: string, fallback: number): number {
  const raw = String(form.get(key) ?? '').replace(/[^\d.]/g, '');
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return fallback;
  return Math.min(5000, Math.max(0, Math.round(n * 100)));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function readEventForm(form: FormData): Omit<NewEvent, 'status' | 'paused'> {
  const celebrants = text(form, 'celebrants') ?? '';
  const title = text(form, 'title') ?? celebrants;
  const acct = text(form, 'accountNumber')?.replace(/\D/g, '') ?? null;
  return {
    slug: slugify(text(form, 'slug') ?? celebrants),
    title,
    celebrants,
    mcName: text(form, 'mcName') ?? '',
    nextUp: text(form, 'nextUp'),
    bigSprayKobo: nairaToKobo(form, 'bigSprayNaira', 100_000_00),
    platformFeeBps: percentToBps(form, 'platformFeePercent', 500),
    mcFeeBps: percentToBps(form, 'mcFeePercent', 0),
    accountNumber: acct || null,
    accountBank: text(form, 'accountBank'),
    accountName: text(form, 'accountName'),
    celebrantBank: text(form, 'celebrantBank'),
    celebrantAccountNumber: text(form, 'celebrantAccountNumber'),
    celebrantAccountName: text(form, 'celebrantAccountName'),
    mcBank: text(form, 'mcBank'),
    mcAccountNumber: text(form, 'mcAccountNumber'),
    mcAccountName: text(form, 'mcAccountName'),
    paystackSplitCode: text(form, 'paystackSplitCode'),
  };
}

export async function createEvent(_prev: string | null, form: FormData): Promise<string | null> {
  await requireAdmin();
  const data = readEventForm(form);
  if (!data.celebrants) return 'Please enter who is being celebrated.';
  if (!data.slug) return 'Please enter a web address for the event.';
  let id: string;
  try {
    const event = await getStore().createEvent({ ...data, status: 'draft', paused: false });
    id = event.id;
  } catch (err) {
    return err instanceof Error ? err.message : 'Could not create the event.';
  }
  revalidatePath('/admin');
  redirect(`/admin/events/${id}`);
}

export async function saveEvent(id: string, _prev: string | null, form: FormData): Promise<string | null> {
  await requireAdmin();
  const data = readEventForm(form);
  if (!data.celebrants) return 'Please enter who is being celebrated.';
  if (!data.slug) return 'Please enter a web address for the event.';
  try {
    await getStore().updateEvent(id, data);
  } catch (err) {
    return err instanceof Error ? err.message : 'Could not save.';
  }
  revalidatePath(`/admin/events/${id}`);
  return 'Saved.';
}

export async function setStatus(id: string, status: EventStatus) {
  await requireAdmin();
  await getStore().updateEvent(id, { status });
  revalidatePath(`/admin/events/${id}`);
}

export async function setPaused(id: string, paused: boolean) {
  await requireAdmin();
  await getStore().updateEvent(id, { paused });
  revalidatePath(`/admin/events/${id}`);
}

export async function setNextUp(id: string, form: FormData) {
  await requireAdmin();
  await getStore().updateEvent(id, { nextUp: text(form, 'nextUp') });
  revalidatePath(`/admin/events/${id}`);
}

export async function setHidden(eventId: string, sprayId: number, hidden: boolean) {
  await requireAdmin();
  await getStore().setSprayHidden(eventId, sprayId, hidden);
  revalidatePath(`/admin/events/${eventId}`);
}

/** TEST MODE ONLY: pretend someone transferred straight to the event account. */
export async function simulateDirectTransfer(eventId: string, _prev: string | null, form: FormData): Promise<string | null> {
  await requireAdmin();
  if (!simulateAllowed()) return 'Test payments are switched off in live mode.';
  const event = await getStore().getEventById(eventId);
  if (!event) return 'Event not found.';
  const amountKobo = nairaToKobo(form, 'amountNaira', 0);
  if (amountKobo < 100_00) return 'Enter at least ₦100.';
  await confirmDirectSpray(event, {
    reference: `TEST-${newReference()}`,
    amountKobo,
    senderName: text(form, 'senderName'),
    narration: text(form, 'narration'),
  });
  revalidatePath(`/admin/events/${eventId}`);
  return 'Test transfer sent. Look at the big screen!';
}
