import { NextResponse } from 'next/server';
import { getScreenFeed } from '@/lib/screen-feed';

export const dynamic = 'force-dynamic';

// The big screen asks for this every couple of seconds. If the venue internet
// drops, the screen simply asks again later and catches up on what it missed.
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const feed = await getScreenFeed(slug);
  if (!feed) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  return NextResponse.json(feed, { headers: { 'Cache-Control': 'no-store' } });
}
