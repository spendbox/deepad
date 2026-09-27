import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, isValidAdminToken, PLANNER_COOKIE, readPlannerToken } from '@/lib/auth';
import { paystackConfigured, resolveAccount } from '@/lib/paystack';

// Look up the name on a bank account. Logged-in planners (and the DashPad admin) only, to stop abuse.
export async function GET(req: Request) {
  const jar = await cookies();
  const allowed = (await readPlannerToken(jar.get(PLANNER_COOKIE)?.value)) || (await isValidAdminToken(jar.get(ADMIN_COOKIE)?.value));
  if (!allowed) {
    return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  }
  const url = new URL(req.url);
  const account = (url.searchParams.get('account') ?? '').replace(/\D/g, '');
  const bank = url.searchParams.get('bank') ?? '';
  if (account.length !== 10 || !bank) return NextResponse.json({ error: 'Enter a 10-digit account number.' }, { status: 400 });
  if (!paystackConfigured()) return NextResponse.json({ error: 'Payments are not connected yet.' }, { status: 503 });
  try {
    return NextResponse.json({ accountName: await resolveAccount(account, bank) });
  } catch {
    return NextResponse.json({ error: 'We could not find that account. Check the number and bank.' }, { status: 404 });
  }
}
