import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Paystack signs every webhook: x-paystack-signature is the HMAC-SHA512 of the
 * raw request body using our secret key. If it does not match, the request did
 * not come from Paystack and must be ignored. This is the "no fake alerts" lock.
 */
export function isValidPaystackSignature(
  rawBody: string,
  signature: string | null,
  secretKey: string,
): boolean {
  if (!signature || !secretKey) return false;
  const expected = createHmac('sha512', secretKey).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
