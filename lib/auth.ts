// Signed login cookies for planners and for the DashPad admin. Uses Web
// Crypto so it works both in middleware and in normal server code.

export const PLANNER_COOKIE = 'dp_planner';
export const ADMIN_COOKIE = 'dp_admin';
export const PLANNER_SESSION_DAYS = 30;

/** The signing key. ADMIN_SESSION_SECRET must be set on the live site. */
function signingSecret(): string | null {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (s) return s;
  return process.env.NODE_ENV === 'production' ? null : 'dev-only-secret';
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ----- Planners -----

/**
 * A short fingerprint of the planner's password. It is part of the login
 * cookie, so changing the password logs out every other phone and laptop.
 */
export async function passwordVersion(passwordHash: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passwordHash));
  return Array.from(new Uint8Array(digest).slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function makePlannerToken(plannerId: string, pv: string): Promise<string | null> {
  const secret = signingSecret();
  if (!secret) return null;
  const exp = Date.now() + PLANNER_SESSION_DAYS * 86_400_000;
  const sig = await hmacHex(secret, `planner|${plannerId}|${exp}|${pv}`);
  return `${plannerId}.${exp}.${pv}.${sig}`;
}

/** Returns who is logged in if the cookie is genuine and not expired. */
export async function readPlannerToken(token: string | undefined | null): Promise<{ id: string; pv: string } | null> {
  const secret = signingSecret();
  if (!token || !secret) return null;
  const [id, expText, pv, sig] = token.split('.');
  const exp = Number(expText);
  if (!id || !pv || !sig || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = await hmacHex(secret, `planner|${id}|${exp}|${pv}`);
  return sameText(sig, expected) ? { id, pv } : null;
}

// ----- DashPad admin (Wilson) -----

/** In production ADMIN_PASSWORD must be set. On a developer's computer it defaults to "admin". */
export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  if (p) return p;
  return process.env.NODE_ENV === 'production' ? null : 'admin';
}

export async function makeAdminToken(): Promise<string | null> {
  const password = adminPassword();
  const secret = signingSecret();
  if (!password || !secret) return null;
  return hmacHex(secret + '|' + password, 'dashpad-admin-session-v1');
}

export async function isValidAdminToken(token: string | undefined | null): Promise<boolean> {
  const expected = await makeAdminToken();
  return !!token && !!expected && sameText(token, expected);
}

export async function checkAdminPassword(attempt: string): Promise<boolean> {
  const password = adminPassword();
  if (!password) return false;
  const [a, b] = await Promise.all([hmacHex('cmp', attempt), hmacHex('cmp', password)]);
  return sameText(a, b);
}
