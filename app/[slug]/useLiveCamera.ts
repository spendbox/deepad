'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScreenFeed } from '@/lib/events';
import { fetchIce, iceGathered } from '@/lib/webrtc';

const DROP_GRACE_MS = 5000; // a short blip keeps the video; longer and the photo comes back
const LOCAL_KEY = 'dp-camera-device';

export type CameraDevice = { id: string; label: string };

/**
 * Live video for the big screen, from either:
 *  - a camera plugged into this computer (chosen from the "Camera" menu), or
 *  - a phone that opened the event's camera link and tapped "Go live".
 * A plugged-in camera wins if both are on. Only a screen opened from the
 * planner's dashboard (with its ?screen= key) receives the phone's video.
 */
export function useLiveCamera(code: string, camera: ScreenFeed['camera'], enabled: boolean) {
  const [key, setKey] = useState<string | null>(null);
  const [phoneStream, setPhoneStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localId, setLocalId] = useState<string | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const current = useRef<string | null>(null);

  useEffect(() => {
    setKey(new URLSearchParams(window.location.search).get('screen'));
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
      const q = `key=${encodeURIComponent(key ?? '')}`;
      try {
        const res = await fetch(`/api/screen/${encodeURIComponent(code)}/camera?${q}&session=${session}`, { cache: 'no-store' });
        const { offer } = (await res.json()) as { offer: string | null };
        if (!offer || current.current !== session) return;
        const iceServers = await fetchIce(`/api/ice?screen=${encodeURIComponent(code)}&${q}`);
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
          if (st === 'connected') clearTimeout(dropTimer);
          else if (st === 'failed' || st === 'closed') hangUp();
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
          body: JSON.stringify({ session, answer: peer.localDescription?.sdp }),
        });
        const { ok } = (await sent.json()) as { ok?: boolean };
        if (!ok && pc.current === peer) hangUp(); // another screen got there first
      } catch (err) {
        console.error('camera connect failed', err);
        if (current.current === session) hangUp();
      }
    },
    [code, key, hangUp],
  );

  const session = camera?.session ?? null;
  const answered = camera?.answered ?? false;
  useEffect(() => {
    if (!enabled || !key || localId) {
      if (pc.current) hangUp();
      current.current = null;
      return;
    }
    if (!session) {
      // The phone stopped (or went quiet): back to the photo.
      if (pc.current) hangUp();
      current.current = null;
      return;
    }
    if (session === current.current) return;
    if (answered) return; // someone else's session, already taken
    answer(session);
  }, [enabled, key, localId, session, answered, answer, hangUp]);

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
    source: localStream ? ('local' as const) : phoneStream ? ('phone' as const) : null,
    canUsePhone: !!key,
    devices,
    localId,
    localError,
    chooseLocal,
    refreshDevices,
  };
}
