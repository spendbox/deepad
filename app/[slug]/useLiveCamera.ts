'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScreenFeed } from '@/lib/events';
import { fetchIce, iceGathered, newSessionId } from '@/lib/webrtc';

const DROP_GRACE_MS = 5000; // a short blip keeps the video; longer and the photo comes back
const LOCAL_KEY = 'dp-camera-device';

export type CameraDevice = { id: string; label: string };

/** This open big screen's own id (kept if the page is reloaded in the same tab). */
export function screenIdFor(code: string): string {
  const k = `dp-screen-id:${code}`;
  try {
    const old = sessionStorage.getItem(k);
    if (old) return old;
    const id = newSessionId();
    sessionStorage.setItem(k, id);
    return id;
  } catch {
    return newSessionId();
  }
}

/**
 * Live video for the big screen, from either:
 *  - a camera plugged into this computer (chosen from the "Camera" menu), or
 *  - a phone that opened the event's camera link and tapped "Go live".
 * A plugged-in camera wins if both are on. One open big screen at a time shows
 * the phone's video: the one opened from the dashboard takes it by itself, and
 * any other computer's screen can take it over with "Show camera on this screen".
 * Phones and tablets never receive it.
 */
export function useLiveCamera(code: string, sid: string | null, camera: ScreenFeed['camera'], enabled: boolean) {
  const [key, setKey] = useState<string | null>(null);
  const [touch, setTouch] = useState(true);
  const [phoneStream, setPhoneStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localId, setLocalId] = useState<string | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [phoneProblem, setPhoneProblem] = useState<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const current = useRef<string | null>(null);

  useEffect(() => {
    setKey(new URLSearchParams(window.location.search).get('screen'));
    // Tablets and phones (touch screens) don't show the camera: only computers driving a TV or projector do.
    setTouch(!!window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches);
    try {
      setLocalId(localStorage.getItem(`${LOCAL_KEY}:${code}`));
    } catch {}
  }, [code]);

  // --- A phone camera ---
  const hangUp = useCallback(() => {
    pc.current?.close();
    pc.current = null;
    setPhoneStream(null);
  }, []);

  const answer = useCallback(
    async (session: string) => {
      hangUp();
      current.current = session;
      const q = `sid=${encodeURIComponent(sid ?? '')}`;
      try {
        const res = await fetch(`/api/screen/${encodeURIComponent(code)}/camera?${q}&session=${session}`, { cache: 'no-store' });
        const { offer } = (await res.json()) as { offer: string | null };
        if (!offer || current.current !== session) return;
        const { iceServers } = await fetchIce(`/api/ice?screen=${encodeURIComponent(code)}&${q}`);
        if (current.current !== session) return;
        const peer = new RTCPeerConnection({ iceServers });
        pc.current = peer;
        peer.ontrack = (ev) => {
          if (pc.current === peer) setPhoneStream(ev.streams[0] ?? new MediaStream([ev.track]));
        };
        let dropTimer: ReturnType<typeof setTimeout> | undefined;
        peer.onconnectionstatechange = () => {
          if (pc.current !== peer) return;
          const st = peer.connectionState;
          if (st === 'connected') {
            clearTimeout(dropTimer);
            setPhoneProblem(null);
          } else if (st === 'failed') {
            setPhoneProblem('A phone camera tried to connect, but its video couldn’t get through the network. It keeps trying by itself.');
            hangUp();
          } else if (st === 'closed') hangUp();
          else if (st === 'disconnected') {
            clearTimeout(dropTimer);
            dropTimer = setTimeout(() => pc.current === peer && peer.connectionState !== 'connected' && hangUp(), DROP_GRACE_MS);
          }
        };
        await peer.setRemoteDescription({ type: 'offer', sdp: offer });
        await peer.setLocalDescription(await peer.createAnswer());
        await iceGathered(peer);
        if (pc.current !== peer) return;
        const sent = await fetch(`/api/screen/${encodeURIComponent(code)}/camera?${q}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sid, session, answer: peer.localDescription?.sdp }),
        });
        const { ok } = (await sent.json()) as { ok?: boolean };
        if (!ok && pc.current === peer) hangUp(); // another screen got there first
      } catch (err) {
        console.error('camera connect failed', err);
        if (current.current === session) hangUp();
      }
    },
    [code, sid, hangUp],
  );

  const eligible = enabled && !touch && !!sid;
  const claim = useCallback(
    async (auto = false, opts: { keep?: boolean; restart?: boolean } = {}) => {
      if (!sid) return false;
      try {
        const res = await fetch(`/api/screen/${encodeURIComponent(code)}/camera?key=${encodeURIComponent(key ?? '')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sid, claim: true, auto, ...opts }),
        });
        return !!((await res.json()) as { ok?: boolean }).ok;
      } catch {
        return false;
      }
    },
    [code, sid, key],
  );
  const [claiming, setClaiming] = useState(false);
  const autoTried = useRef<string | null>(null);

  const session = camera?.session ?? null;
  const answered = camera?.answered ?? false;
  const mine = camera?.mine ?? false;
  const free = camera?.free ?? false;
  useEffect(() => {
    if (!eligible || localId || !session) {
      // No phone camera (it stopped or went quiet), or a plugged-in one is used: back to the photo.
      if (pc.current) hangUp();
      current.current = null;
      return;
    }
    if (!mine) {
      // Showing it, and nobody else has taken it (this screen just missed a check-in, e.g. a Wi-Fi blip):
      // keep the picture and quietly hold on to the camera.
      if (free && pc.current && current.current === session) {
        claim(true, { keep: true });
        return;
      }
      if (pc.current) hangUp(); // another screen has taken the camera
      current.current = null;
      // The dashboard's screen takes a free camera by itself (once per phone session).
      if (free && key && autoTried.current !== session) {
        autoTried.current = session;
        claim(true);
      }
      return;
    }
    if (session === current.current) return;
    if (answered) return; // answered by this screen before a reload: the phone reconnects by itself
    answer(session);
  }, [eligible, localId, session, answered, mine, free, key, answer, hangUp, claim]);

  // Safety net: this screen holds the camera and the phone is live, but no picture has been
  // coming for a while (the connection quietly died). Ask the phone to reconnect.
  const watch = useRef<{ since: number; asked: number }>({ since: 0, asked: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const w = watch.current;
      const track = phoneStream?.getVideoTracks()[0];
      const noPicture = !track || track.muted || track.readyState === 'ended';
      const stuck = eligible && !localId && mine && answered && noPicture;
      if (!stuck) {
        w.since = 0;
        return;
      }
      const now = Date.now();
      w.since ||= now;
      if (now - w.since > 12_000 && now - w.asked > 30_000) {
        w.asked = now;
        claim(false, { restart: true });
      }
    }, 2000);
    return () => clearInterval(id);
  }, [eligible, localId, mine, answered, phoneStream, claim]);

  /** "Show camera on this screen": this screen takes the video; the others stop showing it. */
  const takeOver = useCallback(async () => {
    setClaiming(true);
    await claim(false);
    setClaiming(false);
  }, [claim]);

  useEffect(() => () => pc.current?.close(), []);

  // --- A camera plugged into this computer ---
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'videoinput' && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !navigator.mediaDevices) return;
    refreshDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', refreshDevices);
  }, [enabled, refreshDevices]);

  useEffect(() => {
    if (!enabled || !localId) {
      setLocalStream(null);
      return;
    }
    let alive = true;
    let got: MediaStream | null = null;
    setLocalError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: localId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        got = s;
        // Unplugged: back to the photo (or the phone).
        s.getVideoTracks()[0]?.addEventListener('ended', () => alive && setLocalStream(null));
        setLocalStream(s);
        refreshDevices(); // names show once the camera is allowed
      })
      .catch(() => {
        if (!alive) return;
        setLocalError('That camera couldn’t start. Check it’s plugged in and not used by another app.');
        setLocalStream(null);
      });
    return () => {
      alive = false;
      got?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled, localId, refreshDevices]);

  const chooseLocal = useCallback(
    (id: string | null) => {
      setLocalId(id);
      try {
        if (id) localStorage.setItem(`${LOCAL_KEY}:${code}`, id);
        else localStorage.removeItem(`${LOCAL_KEY}:${code}`);
      } catch {}
    },
    [code],
  );

  return {
    stream: localStream ?? phoneStream,
    /** A phone is live (or trying) but shows on another screen, or none yet: offer to show it here. */
    canTakeOver: eligible && !localId && !!camera && !mine,
    takeOver,
    claiming,
    phoneProblem: localId ? null : phoneProblem,
    source: localStream ? ('local' as const) : phoneStream ? ('phone' as const) : null,
    devices,
    localId,
    localError,
    chooseLocal,
    refreshDevices,
  };
}
