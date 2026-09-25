import { after, NextResponse } from 'next/server';
import { eventPhase } from '@/lib/event-info';
import { SESSION_RE, screenSeen } from '@/lib/camera';
import { checkPaystackForTransfers, closeEvent, screenFeed } from '@/lib/events';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The big screen asks for this every couple of seconds. If the venue internet
// drops, the screen asks again later and catches up on what it missed.
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const event = await getStore().getEventBySlug(code);
  if (!event || event.deletedAt) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Backup for missed payment notifications: ask Paystack directly every few seconds.
  after(() => checkPaystackForTransfers(event).catch((err) => console.error('checkPaystack failed', err)));

  // The event just finished: switch off its account and email the report
  // straight away (the daily clean-up job is only a backup).
  if (eventPhase(event) === 'ended' && (!event.closedAt || !event.reportSentAt)) {
    after(() => closeEvent(event).catch((err) => console.error('closeEvent failed', err)));
  }

  const q = new URL(req.url).searchParams;
  const afterId = Number(q.get('after'));
  // Each big screen has its own id; the one showing the camera checks in so it keeps it.
  const sid = q.get('sid');
  const screenId = sid && SESSION_RE.test(sid) ? sid : undefined;
  if (screenId) after(() => screenSeen(event, screenId).catch(() => {}));
  return NextResponse.json(await screenFeed(event, Number.isFinite(afterId) && afterId > 0 ? afterId : undefined, screenId), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
