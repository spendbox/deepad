import { NextResponse } from 'next/server';
import { cameraScreen, eventByCameraToken, iceServers, relayConfigured } from '@/lib/camera';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Connection addresses for the live camera. Only the camera phone (its secret
// link) or the big screen holding the camera can ask, so the free relay
// allowance can't be used up by strangers.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const camera = q.get('camera');
  const screen = q.get('screen');
  let allowed = false;
  if (camera) allowed = !!(await eventByCameraToken(camera));
  else if (screen) {
    const event = await getStore().getEventBySlug(screen);
    allowed = !!event && !event.deletedAt && !!q.get('sid') && cameraScreen(event) === q.get('sid');
  }
  if (!allowed) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return NextResponse.json({ iceServers: await iceServers(), relay: relayConfigured() }, { headers: { 'Cache-Control': 'no-store' } });
}
