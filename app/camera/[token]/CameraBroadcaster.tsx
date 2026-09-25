'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Logo from '@/components/Logo';
import { fetchIce, iceGathered, newSessionId, sharpFromTheStart } from '@/lib/webrtc';

type Props = { token: string; title: string; celebrantName: string; ended: boolean };
type State = 'off' | 'starting' | 'preview' | 'connecting' | 'waiting' | 'live' | 'replaced' | 'error';
type Facing = 'environment' | 'user';

const MAX_BITRATE = 2_500_000; // sharp enough for a big screen, light enough for venue internet
const WAITING_AFTER_MS = 10_000; // no big screen answered yet: explain what to check
const DROP_GRACE_MS = 6000; // a short blip is fine; longer than this and we reconnect

/**
 * The camera person's phone. It shows the camera, and on "Go live" sends the
 * video straight to the big screen (the video never goes through our servers).
 * If the connection drops it reconnects by itself.
 */
export default function CameraBroadcaster({ token, title, celebrantName, ended }: Props) {
  const [state, setState] = useState<State>('off');
  const [facing, setFacing] = useState<Facing>('environment');
  const [error, setError] = useState<string | null>(null);
  const [portrait, setPortrait] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const session = useRef<string | null>(null);
  const wantLive = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  // --- The camera itself ---
  const startCamera = useCallback(async (want: Facing) => {
    setError(null);
    setState((s) => (s === 'off' || s === 'error' ? 'starting' : s));
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: want }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false, // the venue has its own sound; a phone mic would only echo
      });
      const old = stream.current;
      stream.current = next;
      if (video.current) video.current.srcObject = next;
      // Already live? Swap the picture without dropping the connection.
      const sender = pc.current?.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(next.getVideoTracks()[0]).catch(() => {});
      old?.getTracks().forEach((t) => t.stop());
      setState((s) => (s === 'starting' || s === 'off' || s === 'error' ? 'preview' : s));
    } catch (err) {
      const name = (err as { name?: string }).name;
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission was blocked. Allow the camera for this page in your browser settings, then try again.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : 'The camera couldn’t start. Close other apps using the camera and try again.',
      );
      setState('error');
    }
  }, []);

  // --- Going live ---
  const closeConnection = useCallback(() => {
    clearTimers();
    pc.current?.close();
    pc.current = null;
  }, []);

  const hangUp = useCallback(
    (keepalive = false) => {
      const s = session.current;
      session.current = null;
      if (s) fetch(`/api/camera/${token}?session=${s}`, { method: 'DELETE', keepalive }).catch(() => {});
      closeConnection();
    },
    [token, closeConnection],
  );

  const connect = useCallback(async () => {
    if (!stream.current || !wantLive.current) return;
    closeConnection();
    setState('connecting');
    const id = newSessionId();
    session.current = id;
    const iceServers = await fetchIce(`/api/ice?camera=${encodeURIComponent(token)}`);
    if (session.current !== id) return;
    const peer = new RTCPeerConnection({ iceServers });
    pc.current = peer;
    const cam = stream.current;
    const sender = peer.addTransceiver(cam.getVideoTracks()[0], { direction: 'sendonly', streams: [cam] }).sender;
    try {
      const params = sender.getParameters();
      params.encodings = params.encodings?.length ? params.encodings : [{}];
      params.encodings[0].maxBitrate = MAX_BITRATE;
      await sender.setParameters(params);
    } catch {}

    let dropTimer: ReturnType<typeof setTimeout> | undefined;
    peer.onconnectionstatechange = () => {
      if (pc.current !== peer) return;
      const st = peer.connectionState;
      if (st === 'connected') {
        clearTimeout(dropTimer);
        setState('live');
      } else if (st === 'failed') {
        reconnect();
      } else if (st === 'disconnected') {
        clearTimeout(dropTimer);
        dropTimer = setTimeout(() => pc.current === peer && peer.connectionState !== 'connected' && reconnect(), DROP_GRACE_MS);
      }
    };

    await peer.setLocalDescription(await peer.createOffer());
    await iceGathered(peer);
    if (pc.current !== peer) return;
    const res = await fetch(`/api/camera/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: id, offer: peer.localDescription?.sdp }),
    }).catch(() => null);
    if (!res?.ok) {
      const msg = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
      if (res && res.status >= 400 && res.status < 500) {
        wantLive.current = false;
        setError(msg ?? 'This camera link no longer works.');
        setState('error');
        closeConnection();
        return;
      }
      later(reconnect, 3000); // no internet for a moment: try again
      return;
    }

    // Wait for the big screen to answer, then keep checking in so it knows we're still here.
    const started = Date.now();
    const check = async () => {
      if (pc.current !== peer) return;
      try {
        const r = await fetch(`/api/camera/${token}?session=${id}`, { cache: 'no-store' });
        const data = (await r.json()) as { active: boolean; answer: string | null };
        if (pc.current !== peer) return;
        if (!data.active) {
          // Another phone went live on this event, or the event ended.
          wantLive.current = false;
          session.current = null;
          closeConnection();
          setState('replaced');
          return;
        }
        if (data.answer && !peer.remoteDescription) await peer.setRemoteDescription({ type: 'answer', sdp: sharpFromTheStart(data.answer) });
        if (!peer.remoteDescription && Date.now() - started > WAITING_AFTER_MS) setState('waiting');
      } catch {}
      later(check, peer.connectionState === 'connected' ? 5000 : 1500);
    };
    check();

    function reconnect() {
      if (!wantLive.current) return;
      hangUp();
      later(connect, 800);
    }
  }, [token, closeConnection, hangUp]);

  const goLive = () => {
    wantLive.current = true;
    connect();
  };
  const stop = () => {
    wantLive.current = false;
    hangUp();
    setState('preview');
  };
  const flip = () => {
    const next: Facing = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    startCamera(next);
  };

  // Keep the phone awake while live; after the phone was locked, bring the camera back.
  useEffect(() => {
    const live = state === 'live' || state === 'connecting' || state === 'waiting';
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (live && nav.wakeLock && !lock.current) nav.wakeLock.request('screen').then((l) => (lock.current = l)).catch(() => {});
    if (!live && lock.current) {
      lock.current.release().catch(() => {});
      lock.current = null;
    }
  }, [state]);

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible' || !stream.current) return;
      const track = stream.current.getVideoTracks()[0];
      if (track?.readyState === 'ended') {
        await startCamera(facing);
        if (wantLive.current) connect();
      }
    };
    const onLeave = () => hangUp(true);
    const onTurn = () => setPortrait(window.innerHeight > window.innerWidth);
    onTurn();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('resize', onTurn);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('resize', onTurn);
    };
  }, [facing, startCamera, connect, hangUp]);

  useEffect(
    () => () => {
      wantLive.current = false;
      hangUp(true);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [hangUp],
  );

  const on = state !== 'off' && state !== 'starting' && state !== 'error';
  const isLive = state === 'live';
  const busy = state === 'connecting' || state === 'waiting';

  return (
    <main className={`cam${on ? ' on' : ''}`}>
      <video ref={video} className={`cam-video${facing === 'user' ? ' mirror' : ''}`} autoPlay playsInline muted />

      <header className="cam-top">
        <Logo size={22} tone="dark" />
        <span className={`cam-pill ${isLive ? 'live' : busy ? 'busy' : ''}`} role="status">
          {isLive ? (
            <><span className="cam-dot" />Live on the big screen</>
          ) : busy ? (
            'Connecting…'
          ) : (
            'Not live'
          )}
        </span>
      </header>

      {!on && (
        <section className="cam-intro">
          <div className="cam-icon" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <h1>Show {celebrantName} live on the big screen</h1>
          <p className="cam-sub">{title}</p>
          {ended ? (
            <p className="cam-msg">This event has ended, so the camera can’t go live.</p>
          ) : (
            <>
              <ol className="cam-steps">
                <li>Turn on the camera and allow it when asked.</li>
                <li>Hold the phone sideways and point it at {celebrantName}.</li>
                <li>Tap <strong>Go live</strong>. The big screen switches to your video.</li>
              </ol>
              {error && <p className="cam-error" role="alert">{error}</p>}
              <button type="button" className="cam-btn primary" onClick={() => startCamera(facing)} disabled={state === 'starting'}>
                {state === 'starting' ? 'Starting camera…' : 'Turn on camera'}
              </button>
            </>
          )}
        </section>
      )}

      {on && (
        <>
          {portrait && <div className="cam-tip">Turn your phone sideways for the best picture.</div>}
          {state === 'waiting' && (
            <div className="cam-tip warn">
              Waiting for the big screen… Make sure it’s open, using <strong>Open big screen</strong> in the DashPad dashboard.
            </div>
          )}
          {state === 'replaced' && <div className="cam-tip warn">Another camera has gone live, so this one stopped.</div>}
          <footer className="cam-bar">
            <button type="button" className="cam-round" onClick={flip} aria-label="Switch between front and back camera">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5" /><path d="M20 4v4.5h-4.5" /><path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5" /><path d="M4 20v-4.5h4.5" />
              </svg>
            </button>
            {isLive || busy ? (
              <button type="button" className="cam-btn stop" onClick={stop}>Stop</button>
            ) : (
              <button type="button" className="cam-btn go" onClick={goLive}><span className="cam-dot" />Go live</button>
            )}
            <span className="cam-round ghost" aria-hidden="true" />
          </footer>
        </>
      )}
    </main>
  );
}
