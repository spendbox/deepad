'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Logo from '@/components/Logo';
import { canKeepAwake, keepAwake } from '@/lib/wake';
import { askMotionPermission, correction, FrameRotator, screenAngle, watchHold } from '@/lib/rotator';
import { fetchIce, iceGathered, newSessionId, sharpFromTheStart } from '@/lib/webrtc';

type Props = { token: string; title: string; celebrantName: string; ended: boolean };
type State = 'off' | 'starting' | 'preview' | 'connecting' | 'waiting' | 'live' | 'replaced' | 'error';
type Facing = 'environment' | 'user';

const MAX_BITRATE = 2_500_000; // sharp enough for a big screen, light enough for venue internet
const WAITING_AFTER_MS = 6_000; // no big screen answered yet: explain what to check
const DROP_GRACE_MS = 6000; // a short blip is fine; longer than this and we reconnect
const FOUND_TIMEOUT_MS = 15_000; // the big screen answered but the video can't get through: try again and say why

/** Where "Go live" has got to, so the camera person always knows what's happening. */
type Step = 'prep' | 'looking' | 'found';

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
  const [step, setStep] = useState<Step>('prep');
  const [problem, setProblem] = useState<string | null>(null);
  const relayOn = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const session = useRef<string | null>(null);
  const wantLive = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Keeping the big screen's picture upright however the phone is held.
  const rotator = useRef<FrameRotator | null>(null);
  const hold = useRef(-1); // which way the phone is held; -1 until the motion sensor has said
  const [extraTurn, setExtraTurn] = useState(0); // the "Rotate" button, in case the sensor gets it wrong
  const extraRef = useRef(0);
  const [turnedNote, setTurnedNote] = useState(false);
  const [held, setHeld] = useState(-1); // which way the phone is physically held (-1: no motion sensor)

  /** What to send: the camera as it is, or turned upright when the phone is held differently from its screen. */
  const outgoing = useCallback((): MediaStreamTrack | null => {
    const cam = stream.current;
    const raw = cam?.getVideoTracks()[0] ?? null;
    if (!cam || !raw) return null;
    // Only turn the picture when the sensor has really told us how the phone is held: without it,
    // the picture the phone makes is already the right way round for how its screen is turned.
    const auto = hold.current >= 0 ? correction(hold.current, screenAngle()) : 0;
    const turn = (auto + extraRef.current) % 360;
    if (turn === 0) return raw;
    rotator.current ??= new FrameRotator();
    rotator.current.setSource(cam);
    rotator.current.setTurn(turn);
    return rotator.current.track();
  }, []);

  const applyTurn = useCallback(() => {
    const sender = pc.current?.getSenders().find((s) => s.track?.kind === 'video' || s.track === null);
    const next = outgoing();
    if (sender && next && sender.track !== next) sender.replaceTrack(next).catch(() => {});
  }, [outgoing]);

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
      rotator.current?.setSource(next);
      // Already live? Swap the picture without dropping the connection.
      const sender = pc.current?.getSenders().find((s) => s.track?.kind === 'video');
      const out = outgoing();
      if (sender && out) await sender.replaceTrack(out).catch(() => {});
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
  }, [outgoing]);

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
    setState((s) => (s === 'waiting' ? s : 'connecting'));
    setStep('prep');
    const id = newSessionId();
    session.current = id;
    const { iceServers, relay } = await fetchIce(`/api/ice?camera=${encodeURIComponent(token)}`);
    relayOn.current = relay;
    if (session.current !== id) return;
    const peer = new RTCPeerConnection({ iceServers });
    pc.current = peer;
    const cam = stream.current;
    const sender = peer.addTransceiver(outgoing() ?? cam.getVideoTracks()[0], { direction: 'sendonly', streams: [cam] }).sender;
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
        setProblem(null);
        setState('live');
      } else if (st === 'failed') {
        blocked();
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
      // No internet for a moment, or a problem on DashPad's side: say so, and keep trying.
      setProblem(msg ?? 'Can’t reach DashPad. Check this phone’s internet. Trying again…');
      session.current = null;
      closeConnection();
      later(connect, 4000);
      return;
    }

    // Wait for the big screen to answer, then keep checking in so it knows we're still here.
    setStep('looking');
    const started = Date.now();
    let foundAt = 0;
    const check = async () => {
      if (pc.current !== peer) return;
      try {
        const r = await fetch(`/api/camera/${token}?session=${id}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status)); // a hiccup, not "replaced": just check again
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
        // The planner moved the video to another big screen: connect to that one.
        if (!data.answer && peer.remoteDescription) {
          reconnect();
          return;
        }
        if (data.answer && !peer.remoteDescription) {
          // Ask for a sharp picture from the start; if this phone's browser won't take that, use the answer as it is.
          await peer
            .setRemoteDescription({ type: 'answer', sdp: sharpFromTheStart(data.answer) })
            .catch(() => peer.setRemoteDescription({ type: 'answer', sdp: data.answer! }));
          foundAt = Date.now();
          setStep('found');
          setState((s) => (s === 'waiting' ? 'connecting' : s));
        }
        if (!peer.remoteDescription && Date.now() - started > WAITING_AFTER_MS) setState('waiting');
        // The big screen answered, but the video still hasn't got through.
        if (foundAt && peer.connectionState !== 'connected' && Date.now() - foundAt > FOUND_TIMEOUT_MS) {
          blocked();
          return;
        }
      } catch {}
      later(check, peer.connectionState === 'connected' ? 2000 : 1200);
    };
    check();

    function reconnect() {
      if (!wantLive.current) return;
      hangUp();
      later(connect, 800);
    }

    // The phone and the big screen found each other but the video can't get through the networks.
    function blocked() {
      if (pc.current !== peer) return;
      setProblem(
        relayOn.current
          ? 'The video couldn’t get through to the big screen. Trying again… A stronger connection (or the venue Wi-Fi) will help.'
          : 'The video can’t get through between this phone’s network and the big screen’s. Trying again… To fix it: connect this phone to the same Wi-Fi as the big-screen laptop, or switch on the free Cloudflare relay (DashPad admin → Setup check).',
      );
      reconnect();
    }
  }, [token, closeConnection, hangUp, outgoing]);

  const goLive = () => {
    wantLive.current = true;
    askMotionPermission(); // iPhones ask once, so we can tell which way the phone is held
    // Android: full screen, turned sideways like a camera app, so the picture is always the right way round.
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    document.documentElement
      .requestFullscreen?.({ navigationUI: 'hide' })
      .then(() => o?.lock?.('landscape'))
      .catch(() => {});
    connect();
  };
  const stop = () => {
    wantLive.current = false;
    hangUp();
    setProblem(null);
    setState('preview');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const rotate = () => {
    extraRef.current = (extraRef.current + 90) % 360;
    setExtraTurn(extraRef.current);
    applyTurn();
    setTurnedNote(true);
    setTimeout(() => setTurnedNote(false), 2500);
  };

  // Which way the phone is really held (and the screen turned): keep the big screen's picture upright.
  useEffect(() => {
    const stopWatching = watchHold((angle) => {
      hold.current = angle;
      setHeld(angle);
      applyTurn();
    });
    const onScreenTurn = () => applyTurn();
    screen.orientation?.addEventListener?.('change', onScreenTurn);
    window.addEventListener('orientationchange', onScreenTurn);
    return () => {
      stopWatching();
      screen.orientation?.removeEventListener?.('change', onScreenTurn);
      window.removeEventListener('orientationchange', onScreenTurn);
      rotator.current?.stop();
    };
  }, [applyTurn]);
  const flip = () => {
    const next: Facing = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    startCamera(next);
  };

  // Keep the phone awake while live (asking again whenever the phone drops it), so the camera never stops.
  const liveish = state === 'live' || state === 'connecting' || state === 'waiting';
  useEffect(() => (liveish ? keepAwake() : undefined), [liveish]);

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
            step === 'found' ? 'Almost live…' : 'Connecting…'
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
          {(held >= 0 ? held % 180 === 0 : portrait) && <div className="cam-tip">Turn your phone sideways for the best picture.</div>}
          {!canKeepAwake() && (
            <div className="cam-tip">Keep this phone’s screen on while filming: set its Auto-Lock (screen timeout) to Never.</div>
          )}
          {turnedNote && (
            <div className="cam-tip" role="status">
              Big screen picture turned {extraTurn ? `${extraTurn}°` : 'back to normal'}. Tap again if it’s still not upright.
            </div>
          )}
          {busy && !problem && state !== 'waiting' && (
            <div className="cam-tip">
              {step === 'prep' ? 'Getting ready…' : step === 'looking' ? 'Looking for the big screen…' : 'Big screen found. Starting the video…'}
            </div>
          )}
          {state === 'waiting' && !problem && (
            <div className="cam-tip warn">
              No big screen is showing this yet. Open the big screen with <strong>Open big screen</strong> in the DashPad dashboard (it connects by
              itself), or on the big-screen computer move the mouse and click <strong>Show camera on this screen</strong>.
            </div>
          )}
          {busy && problem && <div className="cam-tip warn" role="alert">{problem}</div>}
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
            <button type="button" className="cam-round" onClick={rotate} aria-label="Turn the big screen’s picture">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="9" width="11" height="11" rx="2" /><path d="M13 3a8 8 0 0 1 7 7" /><path d="M20 6v4h-4" />
              </svg>
            </button>
          </footer>
        </>
      )}
    </main>
  );
}
