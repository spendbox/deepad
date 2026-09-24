import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, isValidAdminToken, makePlannerToken, passwordVersion, PLANNER_COOKIE, PLANNER_SESSION_DAYS, readPlannerToken } from './auth';
import { getStore } from './store';
import type { Planner } from './types';

export async function currentPlanner(): Promise<Planner | null> {
  const jar = await cookies();
  const session = await readPlannerToken(jar.get(PLANNER_COOKIE)?.value);
  if (!session) return null;
  const planner = await getStore().getPlannerById(session.id);
  // A password change since this login makes the old login invalid.
  if (!planner || (await passwordVersion(planner.passwordHash)) !== session.pv) return null;
  return planner;
}

/** For planner pages and actions: send them to log in if they are not. */
export async function requirePlanner(): Promise<Planner> {
  const planner = await currentPlanner();
  if (!planner) redirect('/login');
  return planner;
}

export async function startPlannerSession(planner: Planner): Promise<boolean> {
  const token = await makePlannerToken(planner.id, await passwordVersion(planner.passwordHash));
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
