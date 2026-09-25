import { NextResponse } from 'next/server';
import { freshCamera, isScreenKey, MAX_SDP, SESSION_RE } from '@/lib/camera';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The big screen's side of the camera handshake. Only a screen opened from the
// planner's dashboard carries the key that lets it receive the video.

type Ctx = { params: Promise<{ code: string }> };
const noStore = { 'Cache-Control': 'no-store' };

async function screenEvent(req: Request, ctx: Ctx) {
  const event = await getStore().getEventBySlug((await ctx.params).code);
  if (!event || event.deletedAt) return null;
  return isScreenKey(event.id, new URL(req.url).searchParams.get('key')) ? event : null;
}

/** The phone's offer, for the screen to answer. */
export async function GET(req: Request, ctx: Ctx) {
  const event = await screenEvent(req, ctx);
  if (!event) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const session = new URL(req.url).searchParams.get('session') ?? '';
  const cam = await freshCamera(event.id);
  if (!cam || cam.sessionId !== session || cam.answer) return NextResponse.json({ offer: null }, { headers: noStore });
  return NextResponse.json({ offer: cam.offer }, { headers: noStore });
}

/** The screen's answer. The first screen to answer gets the video. */
export async function POST(req: Request, ctx: Ctx) {
  const event = await screenEvent(req, ctx);
  if (!event) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { session?: string; answer?: string } | null;
  if (!body?.session || !SESSION_RE.test(body.session) || typeof body.answer !== 'string' || !body.answer.startsWith('v=') || body.answer.length > MAX_SDP) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const ok = await getStore().answerCamera(event.id, body.session, body.answer);
  return NextResponse.json({ ok }, { headers: noStore });
}
