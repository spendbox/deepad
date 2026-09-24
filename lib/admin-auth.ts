// Simple password login for the admin portal. Uses Web Crypto so it works both
// in middleware and in normal server code.

export const ADMIN_COOKIE = 'dp_admin';

/** In production ADMIN_PASSWORD must be set. On a laptop it defaults to "demo". */
export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  if (p) return p;
  return process.env.NODE_ENV === 'production' ? null : 'demo';
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The cookie value that proves someone logged in. Changes if the password changes. */
export async function adminSessionToken(): Promise<string | null> {
  const password = adminPassword();
  if (!password) return null;
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  return hmacHex(secret + '|' + password, 'dashpad-admin-session-v1');
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidAdminToken(token: string | undefined | null): Promise<boolean> {
  const expected = await adminSessionToken();
  return !!token && !!expected && sameText(token, expected);
}

export async function checkAdminPassword(attempt: string): Promise<boolean> {
  const password = adminPassword();
  if (!password) return false;
  // Compare hashes so the comparison takes the same time for any input.
  const [a, b] = await Promise.all([hmacHex('cmp', attempt), hmacHex('cmp', password)]);
  return sameText(a, b);
}
