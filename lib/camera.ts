import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getStore } from './store';
import type { CameraSession, SprayEvent } from './types';

// Live camera: a phone streams video straight to the big screen (WebRTC).
// The video never passes through our servers; we only pass the short
// "handshake" between the phone and the screen, and hand out the addresses
// they use to find each other.

/** A phone that hasn't checked in for this long is treated as gone. */
export const CAMERA_FRESH_MS = 30_000;
/** Offers and answers are a few KB; anything much bigger is not a real one. */
export const MAX_SDP = 30_000;
export const SESSION_RE = /^[A-Za-z0-9_-]{8,40}$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{10,40}$/;
/** A big screen that hasn't checked in for this long no longer holds the camera. */
export const SCREEN_FRESH_MS = 30_000;

/** The big screen currently holding the camera, if it's still open. */
export function cameraScreen(event: SprayEvent): string | null {
  if (!event.cameraScreen || !event.cameraScreenSeenAt) return null;
  return Date.now() - new Date(event.cameraScreenSeenAt).getTime() < SCREEN_FRESH_MS ? event.cameraScreen : null;
}

/** This screen shows the camera from now on; the phone moves over to it. */
export async function claimCamera(event: SprayEvent, screenId: string): Promise<void> {
  const store = getStore();
  const before = cameraScreen(event);
  await store.updateEvent(event.id, { cameraScreen: screenId, cameraScreenSeenAt: new Date().toISOString() });
  if (before !== screenId) await store.resetCameraAnswer(event.id).catch(() => {});
}

/** The screen holding the camera is still open (checked in at most every few seconds). */
export async function screenSeen(event: SprayEvent, screenId: string): Promise<void> {
  if (event.cameraScreen !== screenId) return;
  const last = event.cameraScreenSeenAt ? new Date(event.cameraScreenSeenAt).getTime() : 0;
  if (Date.now() - last < 8_000) return;
  await getStore().updateEvent(event.id, { cameraScreenSeenAt: new Date().toISOString() });
}

/**
 * The big screen's own key. Only a screen opened from the planner's dashboard
 * (with ?screen=key) can receive the phone camera, so a guest opening the
 * event link on a laptop can't take the video.
 */
export function screenKey(eventId: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET || 'dev-only-secret';
  return createHmac('sha256', secret).update(`screen:${eventId}`).digest('base64url').slice(0, 22);
}

export function isScreenKey(eventId: string, key: string | null): boolean {
  if (!key) return false;
  const a = Buffer.from(screenKey(eventId));
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The camera the screen should show: a phone that checked in recently. */
export async function freshCamera(eventId: string): Promise<CameraSession | null> {
  try {
    const cam = await getStore().getCamera(eventId);
    if (!cam || Date.now() - new Date(cam.updatedAt).getTime() > CAMERA_FRESH_MS) return null;
    return cam;
  } catch {
    // e.g. the latest schema.sql hasn't been run yet: the screen still works, just without camera.
    return null;
  }
}

export async function eventByCameraToken(token: string): Promise<SprayEvent | null> {
  if (!TOKEN_RE.test(token)) return null;
  const event = await getStore().getEventByCameraToken(token);
  return event && !event.deletedAt ? event : null;
}

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

const STUN: IceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
let relay: { servers: IceServer[]; until: number } | null = null;

/**
 * How the phone and the screen find each other. Free public "STUN" always; plus
 * Cloudflare's relay ("TURN") when it's set up, for venue Wi-Fi or mobile
 * networks that block direct connections.
 */
export async function iceServers(): Promise<IceServer[]> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_KEY_API_TOKEN;
  if (!keyId || !token) return STUN;
  if (relay && relay.until > Date.now()) return relay.servers;
  try {
    const base = process.env.CLOUDFLARE_TURN_API_BASE || 'https://rtc.live.cloudflare.com';
    const res = await fetch(`${base}/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 6 * 3600 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Cloudflare TURN ${res.status}`);
    const body = (await res.json()) as { iceServers?: IceServer | IceServer[] };
    const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    // Port 53 addresses can stall some browsers, so leave them out (Cloudflare's own advice).
    const servers = list
      .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
      .filter((s) => s.urls.length);
    if (!servers.length) throw new Error('Cloudflare TURN returned no servers');
    relay = { servers, until: Date.now() + 3 * 3600_000 }; // reuse for 3 of the 6 hours they last
    return servers;
  } catch (err) {
    console.error('TURN credentials failed', err);
    return STUN;
  }
}

export function relayConfigured(): boolean {
  return !!(process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_KEY_API_TOKEN);
}
