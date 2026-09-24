import { NextResponse } from 'next/server';
import { closeDueEvents } from '@/lib/events';

export const dynamic = 'force-dynamic';

// Run by Vercel on a schedule (see vercel.json): closes finished events,
// switches off their account numbers and emails each planner their report.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const closed = await closeDueEvents();
  return NextResponse.json({ ok: true, closed });
}
