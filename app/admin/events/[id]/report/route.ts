import { cookies } from 'next/headers';
import { ADMIN_COOKIE, isValidAdminToken } from '@/lib/admin-auth';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

function cell(v: string | number | null | undefined): string {
  let s = v == null ? '' : String(v);
  // Stop spreadsheet apps treating a guest's message as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

// Private after-event report for the celebrant: who sprayed what, real names included.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (!(await isValidAdminToken(jar.get(ADMIN_COOKIE)?.value))) return new Response('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const store = getStore();
  const event = await store.getEventById(id);
  if (!event) return new Response('Not found', { status: 404 });
  const sprays = (await store.listSprays(event.id, 100000)).reverse();

  const header = ['Time', 'Real name', 'Shown on screen as', 'Anonymous', 'Way', 'Amount (NGN)', 'Message', 'Message hidden', 'DashPad fee (NGN)', 'MC fee (NGN)', 'Celebrant receives (NGN)', 'Reference'];
  const lines = [header.map(cell).join(',')];
  for (const s of sprays) {
    lines.push(
      [
        new Date(s.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }),
        s.guestName,
        s.displayName,
        s.anonymous ? 'Yes' : 'No',
        s.source === 'qr' ? 'QR' : 'Direct transfer',
        (s.amountKobo / 100).toFixed(2),
        s.message,
        s.hidden ? 'Yes' : 'No',
        (s.platformFeeKobo / 100).toFixed(2),
        (s.mcFeeKobo / 100).toFixed(2),
        (s.celebrantKobo / 100).toFixed(2),
        s.reference,
      ]
        .map(cell)
        .join(','),
    );
  }
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dashpad-${event.slug}-report.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
