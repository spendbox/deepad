import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { PLANNER_COOKIE, readPlannerToken } from '@/lib/auth';
import { slugProblem } from '@/lib/slug';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Is this event link free? Used live while the planner types it.
export async function GET(req: Request) {
  const jar = await cookies();
  if (!(await readPlannerToken(jar.get(PLANNER_COOKIE)?.value))) {
    return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  }
  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') ?? '').toLowerCase();
  const except = url.searchParams.get('except'); // the event being edited
  const problem = slugProblem(slug);
  if (problem) return NextResponse.json({ available: false, error: problem });
  const existing = await getStore().getEventBySlug(slug);
  if (existing && existing.id !== except) {
    return NextResponse.json({ available: false, error: 'That link is already taken. Try adding the year or a place.' });
  }
  return NextResponse.json({ available: true });
}
