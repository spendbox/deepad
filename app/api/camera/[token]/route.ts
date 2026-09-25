import { NextResponse } from 'next/server';
import { eventPhase } from '@/lib/event-info';
import { eventByCameraToken, MAX_SDP, SESSION_RE } from '@/lib/camera';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The camera phone's side of the handshake. The secret link's token is the
// only way in, so only the planner's camera person can use it.

type Ctx = { params: Promise<{ token: string }> };
const noStore = { 'Cache-Control': 'no-store' };

/** The phone offers its video. Replaces any camera that was on before. */
export async function POST(req: Request, ctx: Ctx) {
  const event = await eventByCameraToken((await ctx.params).token);
  if (!event) return NextResponse.json({ error: 'This camera link no longer works. Ask the planner for a new one.' }, { status: 404 });
  if (eventPhase(event) === 'ended') return NextResponse.json({ error: 'This event has ended.' }, { status: 410 });
  const body = (await req.json().catch(() => null)) as { session?: string; offer?: string } | null;
  if (!body?.session || !SESSION_RE.test(body.session) || typeof body.offer !== 'string' || !body.offer.startsWith('v=') || body.offer.length > MAX_SDP) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  await getStore().startCamera(event.id, body.session, body.offer);
  return NextResponse.json({ ok: true }, { headers: noStore });
}

/** The phone checks in: is there an answer from the big screen yet, and am I still the camera? */
export async function GET(req: Request, ctx: Ctx) {
  const event = await eventByCameraToken((await ctx.params).token);
  if (!event) return NextResponse.json({ error: 'This camera link no longer works.' }, { status: 404 });
  const session = new URL(req.url).searchParams.get('session') ?? '';
  if (!SESSION_RE.test(session)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const store = getStore();
  const active = eventPhase(event) !== 'ended' && (await store.touchCamera(event.id, session));
  const cam = active ? await store.getCamera(event.id) : null;
  return NextResponse.json(
    { active, answer: cam?.sessionId === session ? cam.answer : null },
    { headers: noStore },
  );
}

/** The phone stops streaming. */
export async function DELETE(req: Request, ctx: Ctx) {
  const event = await eventByCameraToken((await ctx.params).token);
  if (!event) return NextResponse.json({ ok: true });
  const session = new URL(req.url).searchParams.get('session') ?? '';
  if (SESSION_RE.test(session)) await getStore().stopCamera(event.id, session);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
