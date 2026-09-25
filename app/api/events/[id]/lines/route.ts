import { NextResponse } from 'next/server';
import { currentPlanner } from '@/lib/session';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Every line for one of the planner's events, for their live moderation list. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const planner = await currentPlanner();
  if (!planner) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  const { id } = await params;
  const event = await getStore().getEventById(id);
  if (!event || event.plannerId !== planner.id || event.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const lines = await getStore().listLines(event.id, { limit: 1000 });
  return NextResponse.json({ lines }, { headers: { 'cache-control': 'no-store' } });
}
