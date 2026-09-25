import { NextResponse } from 'next/server';
import { cameraScreen, claimCamera, freshCamera, isScreenKey, MAX_SDP, SESSION_RE } from '@/lib/camera';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The big screen's side of the camera handshake. Any open big screen (on a
// computer) can take the camera with its "Show camera on this screen" button;
// only the screen holding it may receive the video. A screen opened from the
// dashboard (with its key) takes it by itself when no other screen has it.

type Ctx = { params: Promise<{ code: string }> };
const noStore = { 'Cache-Control': 'no-store' };

async function load(ctx: Ctx) {
  const event = await getStore().getEventBySlug((await ctx.params).code);
  return event && !event.deletedAt ? event : null;
}

/** The phone's offer, for the screen holding the camera to answer. */
export async function GET(req: Request, ctx: Ctx) {
  const event = await load(ctx);
  const q = new URL(req.url).searchParams;
  const sid = q.get('sid') ?? '';
  if (!event || !SESSION_RE.test(sid) || cameraScreen(event) !== sid) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const cam = await freshCamera(event.id);
  if (!cam || cam.sessionId !== q.get('session') || cam.answer) return NextResponse.json({ offer: null }, { headers: noStore });
  return NextResponse.json({ offer: cam.offer }, { headers: noStore });
}

/**
 * { sid, claim: true }: show the camera on this screen (the others stop).
 * { sid, session, answer }: this screen's answer to the phone.
 */
export async function POST(req: Request, ctx: Ctx) {
  const event = await load(ctx);
  const body = (await req.json().catch(() => null)) as { sid?: string; claim?: boolean; auto?: boolean; session?: string; answer?: string } | null;
  if (!event || !body?.sid || !SESSION_RE.test(body.sid)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  if (body.claim) {
    // Taking it by itself (without a button press) only for the dashboard's screen, and only if no open screen has it.
    if (body.auto && (!isScreenKey(event.id, new URL(req.url).searchParams.get('key')) || cameraScreen(event))) {
      return NextResponse.json({ ok: false }, { headers: noStore });
    }
    await claimCamera(event, body.sid);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  if (cameraScreen(event) !== body.sid) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (!body.session || !SESSION_RE.test(body.session) || typeof body.answer !== 'string' || !body.answer.startsWith('v=') || body.answer.length > MAX_SDP) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const ok = await getStore().answerCamera(event.id, body.session, body.answer);
  return NextResponse.json({ ok }, { headers: noStore });
}
