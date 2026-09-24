import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, isValidAdminToken, makePlannerToken, PLANNER_COOKIE, PLANNER_SESSION_DAYS, readPlannerToken } from './auth';
import { getStore } from './store';
import type { Planner } from './types';

export async function currentPlanner(): Promise<Planner | null> {
  const jar = await cookies();
  const id = await readPlannerToken(jar.get(PLANNER_COOKIE)?.value);
  return id ? getStore().getPlannerById(id) : null;
}

/** For planner pages and actions: send them to log in if they are not. */
export async function requirePlanner(): Promise<Planner> {
  const planner = await currentPlanner();
  if (!planner) redirect('/login');
  return planner;
}

export async function startPlannerSession(plannerId: string): Promise<boolean> {
  const token = await makePlannerToken(plannerId);
  if (!token) return false;
  const jar = await cookies();
  jar.set(PLANNER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PLANNER_SESSION_DAYS * 86_400,
  });
  return true;
}

export async function endPlannerSession() {
  (await cookies()).delete(PLANNER_COOKIE);
}

export async function requireAdmin() {
  const jar = await cookies();
  if (!(await isValidAdminToken(jar.get(ADMIN_COOKIE)?.value))) redirect('/admin/login');
}
