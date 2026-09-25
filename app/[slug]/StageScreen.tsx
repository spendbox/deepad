'use client';

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Arena, type BodyKind } from '@/components/arena';
import Avatar from '@/components/Avatar';
import { SprayCanvas } from '@/components/Confetti';
import CopyButton from '@/components/CopyButton';
import FitText from '@/components/FitText';
import Logo from '@/components/Logo';
import Rain from '@/components/Rain';
import type { ScreenFeed, ScreenLine, ScreenTransfer } from '@/lib/events';
import { isCutout } from '@/lib/photos';
import type { ScreenTheme } from '@/lib/themes';

// The big-screen layout, drawn in design pixels and scaled to fit: 1920 wide
// on a TV or projector, 540 wide on a phone, stretched to the screen's own
// shape so it always fills it edge to edge.
// The celebrant stands in the middle, as tall as the screen allows. Everyone
// spraying floats around them as a name tag throwing confetti; approved lines
// pop up around them in turns. Name tags and lines drift and bounce off each
// other, so nothing overlaps. The account number stays big at the bottom.
// Amounts are never shown.

/** Stage size in design pixels, stretched to the screen's shape so nothing is letterboxed. */
export type StageSize = { w: number; h: number };
export type StageMode = 'tv' | 'phone';

/** Room kept at the bottom for the transfer card (smaller while live video plays, so it hides less of it). */
function cardSpace(mode: StageMode, video: boolean) {
  if (mode === 'phone') return 338;
  return video ? 244 : 366;
}

/**
 * Where everything goes on a stage of this size. The celebrant stands in the
 * middle, as tall as the screen allows (their lower half tucks behind the
 * transfer card); names and lines float around them.
 */
function layoutFor({ w, h }: StageSize, mode: StageMode, video: boolean) {
  const cx = w / 2;
  const card = cardSpace(mode, video);
  if (mode === 'phone') {
    const photoTop = 64;
    const cutoutH = h - photoTop - 30;
    const photoH = h - card - photoTop + 60;
    const canvas = { left: 0, top: 50, width: Math.round(w), height: Math.round(h - card + 20) };
    const faceBottom = photoTop + (h - card - photoTop) * 0.42;
    return {
      card,
      arena: { x0: 12, y0: 78, x1: w - 12, y1: h - card - 6 },
      // Only the celebrant's face is kept clear on a phone; names can float over the rest.
      zone: { x0: cx - 105, y0: 50, x1: cx + 105, y1: faceBottom },
      canvas,
      target: { x: [cx - 70, cx + 70] as [number, number], y: [photoTop + 90 - canvas.top, faceBottom + 120 - canvas.top] as [number, number] },
      cutout: { left: cx - Math.min(w * 0.55, cutoutH * 0.4), top: photoTop, width: Math.min(w * 1.1, cutoutH * 0.8), height: cutoutH },
      photo: { left: 24, top: photoTop, width: w - 48, height: photoH },
      monogram: { left: cx - 150, top: (h - card) / 2 - 150, width: 300, height: 300, fontSize: 90 },
      ambient: { cx, cy: faceBottom - 40 },
    };
  }
  const photoTop = 64;
  const cutoutH = h - photoTop - 40; // most of the screen's height
  const photoH = h - 366 - photoTop + 70; // framed photos: the bottom edge hides behind the card
  const half = Math.min(260, cutoutH * 0.27); // clear space kept around the celebrant
  const canvas = { left: 0, top: 60, width: Math.round(w), height: Math.round(h - card - 14) };
  return {
    card,
    arena: { x0: 50, y0: 118, x1: w - 50, y1: h - card },
    zone: { x0: cx - half, y0: 60, x1: cx + half, y1: h - card + 46 }, // nothing floats over (or above) the celebrant
    canvas,
    target: {
      x: [cx - 130, cx + 130] as [number, number],
      y: [200 - canvas.top, h - 520 - canvas.top] as [number, number],
    },
    cutout: { left: cx - cutoutH * 0.36, top: photoTop, width: cutoutH * 0.72, height: cutoutH },
    photo: { left: cx - photoH * 0.4, top: photoTop, width: photoH * 0.8, height: photoH },
    monogram: { left: cx - 210, top: (h - 366) / 2 - 170 },
    ambient: { cx, cy: (h - 366) / 2 + 40 },
  };
}
const MAX_LINES = 3; // lines on screen at once (fewer when a big crowd is spraying)
const LINE_GAP_MS = 1300; // time between one line popping up and the next

/**
 * Someone spraying. First a big name tag for a few seconds; then (if they
 * sprayed enough to keep going) a small bubble that keeps throwing confetti,
 * one piece a second, until their spray is used up.
 */
export type ActiveSprayer = { t: ScreenTransfer; slot: number; leaving: boolean; mini: boolean };

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
}
function dayAndClock(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
}
/** "T.M." → "TM" for the bubble; the first name's letter if there are no initials. */
function bubble(t: ScreenTransfer) {
  return (t.initials ?? t.firstName?.[0] ?? '?').replace(/\./g, '');
}
function monogram(name: string) {
  return name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join(' & ');
}
/** Each line stays up 2 to 5 seconds: longer lines get longer. */
export function lineDuration(text: string) {
  return Math.round(Math.min(5000, Math.max(2000, 1600 + text.length * 40)));
}

/** Puts its element into the arena on mount and takes it out on unmount. */
function ArenaBody({
  arena,
  id,
  kind,
  big,
  perSecond,
  leaving,
  children,
}: {
  arena: Arena;
  id: string;
  kind: BodyKind;
  big?: boolean;
  perSecond?: number;
  leaving: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) arena.add(id, ref.current, { kind, big, perSecond });
    return () => arena.remove(id);
  }, [arena, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => arena.setLeaving(id, leaving), [arena, id, leaving]);
  return (
    <div ref={ref} className="ab">
      {children}
    </div>
  );
}

type Props = {
  e: ScreenFeed['event'];
  theme: ScreenTheme;
  acct: string | null;
  sprayers: ActiveSprayer[];
  paused: boolean;
  online: boolean;
  photo: string | null;
  lines: ScreenLine[];
  /** Live video of the celebrant (a phone or a plugged-in camera), when one is on. */
  video: MediaStream | null;
  size: StageSize;
  mode: StageMode;
  /** Confetti and money rain over the whole screen until this time (ms). */
  rainUntil: number;
  /** The full account number, for the phone's copy button. */
  accountNumber?: string | null;
};

function StageScreen({ e, theme, acct, sprayers, paused, online, photo, lines, video, size, mode, rainUntil, accountNumber }: Props) {
  const [videoOn, setVideoOn] = useState(false);
  const live = e.phase === 'live';
  const phone = mode === 'phone';
  const cutout = photo ? isCutout(photo) : false;
  const layout = useMemo(() => layoutFor(size, mode, videoOn), [size, mode, videoOn]);
  // True while confetti and money are raining.
  const [raining, setRaining] = useState(false);
  useEffect(() => {
    const left = rainUntil - Date.now();
    if (left <= 0) return setRaining(false);
    setRaining(true);
    const t = setTimeout(() => setRaining(false), left + 2500); // + time for the last pieces to fall
    return () => clearTimeout(t);
  }, [rainUntil]);
  const arena = useMemo(() => new Arena(layout.arena, [layout.zone]), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => arena.setBounds(layout.arena, [layout.zone]), [arena, layout]);
  useEffect(() => () => arena.stop(), [arena]);
  const { canvas } = layout;
  const spraying = sprayers.some((s) => !s.leaving);
  const crowd = sprayers.filter((s) => !s.leaving && !s.mini).length + Math.floor(sprayers.filter((s) => !s.leaving && s.mini).length / 2);
  const maxLines = phone ? 1 : crowd >= 7 ? 1 : crowd >= 4 ? 2 : MAX_LINES;
  // Names shrink a little as the screen fills (2 or fewer: full size), never below about three-quarters.
  const tagZoom = Math.max(phone ? 0.78 : 0.72, 1 - Math.max(0, crowd - 2) * (phone ? 0.07 : 0.05));

  const status = !online ? (
    <span className="st-status offline" role="status">Reconnecting… transfers still work</span>
  ) : live && videoOn && !paused ? (
    <span className="st-status cam"><span className="st-dot" />Live camera</span>
  ) : live ? (
    <span className="st-status"><span className="st-dot" />{paused ? 'Paused' : 'Live'}</span>
  ) : null;

  return (
    <div className={`st${videoOn ? ' video' : ''}${phone ? ' phone' : ''}`}>
      {!videoOn && <Ambient at={layout.ambient} size={size} hidden={spraying || raining} />}
      {video && <LiveVideo stream={video} onShowing={setVideoOn} aspect={size.w / size.h} />}
      <header className="st-top">
        <div className="st-top-left">
          <Logo size={phone ? 20 : 30} tone={theme.light && !videoOn ? 'light' : 'dark'} />
          <span className="st-event">{e.title}</span>
        </div>
        <div className="st-top-right">
          {status}
          {live && !phone && <span className="st-closes">Spraying closes {clock(e.endsAt)}</span>}
        </div>
      </header>

      {/* The celebrant, in the middle */}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo}
          src={photo}
          alt={`Photo of ${e.celebrantName}`}
          className={`st-photo fade-in${cutout ? ' cutout' : ''}`}
          style={cutout ? layout.cutout : layout.photo}
        />
      ) : (
        <div className="st-monogram" style={layout.monogram} aria-hidden="true">{monogram(e.celebrantName)}</div>
      )}

      {live ? (
        <>
          {!spraying && !lines.length && !videoOn && !phone && <div className="st-hello">Spray {e.celebrantName}!</div>}
          <Rain until={rainUntil} width={Math.round(size.w)} height={Math.round(size.h)} perSecond={phone ? 40 : 24} style={{ left: 0, top: 0, zIndex: 4 }} />
          <SprayCanvas
            source={() => arena.emitters().map((m) => ({ ...m, x: m.x - canvas.left, y: m.y - canvas.top }))}
            active={spraying}
            target={layout.target}
            width={canvas.width}
            height={canvas.height}
            style={{ left: canvas.left, top: canvas.top, zIndex: 4 }}
          />
          <div
            className={`st-arena${crowd >= 7 ? ' packed' : crowd >= 4 ? ' crowd' : ''}`}
            style={{ '--tz': tagZoom.toFixed(2) } as React.CSSProperties}
            aria-live="polite"
          >
            {sprayers.map((s) => (
              <ArenaBody
                key={`s${s.t.id}`}
                arena={arena}
                id={`s${s.t.id}`}
                kind="sprayer"
                big={s.t.big && !s.mini}
                perSecond={1}
                leaving={s.leaving}
              >
                <div className={`sp-tag${s.t.big && !s.mini ? ' big' : ''}${s.mini ? ' mini' : ''}${s.leaving ? ' leaving' : ''}`}>
                  {s.t.big && !s.mini && <span className="sp-badge">Big spray!</span>}
                  <Avatar
                    name={s.t.firstName ?? 'Guest'}
                    size={s.mini ? (phone ? 30 : 48) : s.t.big ? (phone ? 60 : 104) : phone ? 42 : 68}
                    letters={bubble(s.t)}
                  />
                  <span className="sp-name">{s.t.firstName ?? 'A guest'}</span>
                </div>
              </ArenaBody>
            ))}
            <LineCycler lines={lines} arena={arena} max={maxLines} phone={phone} />
          </div>
        </>
      ) : (
        <div className="st-notice">
          <div className="st-notice-big">{e.phase === 'upcoming' ? 'Spraying opens soon' : 'Thank you for spraying!'}</div>
          <div className="st-notice-sub">
            {e.phase === 'upcoming'
              ? `${dayAndClock(e.startsAt)}. The account number appears here when spraying starts.`
              : `${e.celebrantName} appreciates every one of you. Spraying has closed.`}
          </div>
        </div>
      )}

      {/* How to spray: a clean card with the account number, and the bank right beside it */}
      {live && acct ? (
        phone ? (
          <footer className="st-pay m">
            <div className="st-pay-tab"><BankIcon />Transfer to spray {e.celebrantName}</div>
            <div className="mp-top">
              <div className="st-pay-field">
                <div className="st-pay-label">Account number</div>
                <FitText className="st-acct" text={acct} max={60} />
              </div>
              {accountNumber && <CopyButton text={accountNumber} label="Copy" />}
            </div>
            <div className="mp-bottom">
              <div className="st-pay-field">
                <div className="st-pay-label">Bank</div>
                <FitText className="st-bank" text={e.accountBank ?? ''} max={30} />
              </div>
              {e.accountName && (
                <div className="st-pay-field right">
                  <div className="st-pay-label">Account name</div>
                  <FitText className="st-acct-name-v" text={e.accountName} max={19} />
                </div>
              )}
            </div>
            <div className="mp-note">Transfers can take up to a minute to show. Amounts are never shown.</div>
          </footer>
        ) : videoOn ? (
          // Slimmer while live video plays, so it hides less of the picture.
          <footer className="st-pay slim">
            <div className="st-pay-tab"><BankIcon />Transfer any amount to spray {e.celebrantName}</div>
            <div className="st-pay-note-tab"><ClockIcon />Transfers can take up to a minute to show. Amounts are never shown.</div>
            <div className="st-pay-row3">
              <div className="st-pay-field">
                <div className="st-pay-label">Account number</div>
                <FitText className="st-acct" text={acct} max={84} />
              </div>
              <div className="st-pay-divider" aria-hidden="true" />
              <div className="st-pay-field">
                <div className="st-pay-label">Bank</div>
                <FitText className="st-bank" text={e.accountBank ?? ''} max={62} />
              </div>
              {e.accountName && (
                <>
                  <div className="st-pay-divider" aria-hidden="true" />
                  <div className="st-pay-field">
                    <div className="st-pay-label">Account name</div>
                    <FitText className="st-acct-name-v" text={e.accountName} max={36} />
                  </div>
                </>
              )}
            </div>
          </footer>
        ) : (
          <footer className="st-pay">
            <div className="st-pay-tab">
              <BankIcon />
              Transfer any amount to spray {e.celebrantName}
            </div>
            <div className="st-pay-main">
              <div className="st-pay-field">
                <div className="st-pay-label">Account number</div>
                <FitText className="st-acct" text={acct} max={118} />
              </div>
              <div className="st-pay-divider" aria-hidden="true" />
              <div className="st-pay-field right">
                <div className="st-pay-label">Bank</div>
                <FitText className="st-bank" text={e.accountBank ?? ''} max={104} />
              </div>
            </div>
            <div className="st-pay-foot">
              {e.accountName ? (
                <div className="st-acct-name">
                  <div className="st-pay-label">Account name</div>
                  <FitText className="st-acct-name-v" text={e.accountName} max={40} />
                </div>
              ) : <span />}
              <span className="st-pay-note">
                <ClockIcon />
                <span>Transfers can take up to a minute to show. Only confirmed transfers appear, and amounts are never shown.</span>
              </span>
            </div>
          </footer>
        )
      ) : (
        <footer className={`st-pay quiet${phone ? ' m' : ''}`}>
          <div className="st-pay-quiet">{live ? 'Account number coming soon' : 'Thank you for celebrating with DashPad.'}</div>
        </footer>
      )}
    </div>
  );
}

function BankIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 20h18" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}

/**
 * A slow, soft moving glow behind the celebrant so the screen never looks
 * still: colour clouds drifting and faint light rays turning. Drawn on a tiny
 * canvas (a tenth of the screen's size) a dozen times a second and stretched
 * to fill the screen: soft glows look the same, and it costs almost nothing.
 * It fades away while anyone is spraying (the confetti and money are the show
 * then, and the screen stays smooth on any computer), and during live video.
 */
function Ambient({ at, size, hidden }: { at: { cx: number; cy: number }; size: StageSize; hidden: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = Math.round(size.w / 10);
  const H = Math.round(size.h / 10);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || hidden) return;
    const accent = getComputedStyle(canvas).getPropertyValue('--s-accent').trim() || '#B3136F';
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const blobs = [
      { color: accent, a: 0.26, x: 0.1, y: 0.05, dx: 0.22, dy: 0.18, r: 0.34, p: 28 },
      { color: '#E2A62B', a: 0.2, x: 0.95, y: 0.55, dx: -0.25, dy: -0.2, r: 0.3, p: 34 },
      { color: '#F4A6CB', a: 0.22, x: 0.45, y: 1.05, dx: 0.2, dy: -0.22, r: 0.36, p: 40 },
    ];
    const cx = at.cx / 10;
    const cy = at.cy / 10;
    const rayR = Math.max(W, H) * 0.75;
    const draw = () => {
      const t = still ? 0 : performance.now() / 1000;
      ctx.clearRect(0, 0, W, H);
      for (const b of blobs) {
        const k = (Math.sin((t / b.p) * Math.PI * 2) + 1) / 2; // drifts there and back
        const x = (b.x + b.dx * k) * W;
        const y = (b.y + b.dy * k) * H;
        const r = b.r * Math.max(W, H) * (0.9 + 0.2 * k);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, b.color);
        g.addColorStop(1, 'transparent');
        ctx.globalAlpha = b.a;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      // Faint light rays turning slowly behind the celebrant.
      const rays = ctx.createRadialGradient(cx, cy, 0, cx, cy, rayR);
      rays.addColorStop(0, accent);
      rays.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = rays;
      const turn = (t / 90) * Math.PI * 2;
      for (let i = 0; i < 18; i++) {
        const a0 = turn + (i / 18) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, rayR, a0, a0 + 0.12);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    draw();
    if (still) return;
    const id = setInterval(draw, 80);
    return () => clearInterval(id);
  }, [W, H, at.cx, at.cy, hidden]);
  return (
    <div className={`st-ambient${hidden ? ' off' : ''}`} aria-hidden="true">
      <canvas ref={ref} className="amb-canvas" width={W} height={H} />
      {SPARKLES.map((p, i) => (
        <span key={i} className="amb-spark" style={{ left: `${p[0]}%`, top: `${p[1]}%`, animationDelay: `${p[2]}s` }} />
      ))}
    </div>
  );
}
const SPARKLES: [number, number, number][] = [
  [8, 22, 0], [18, 58, 1.4], [27, 14, 2.7], [34, 40, 0.8], [44, 8, 3.3], [58, 12, 1.9], [66, 44, 0.3], [74, 20, 2.2],
  [83, 56, 3.8], [91, 30, 1.1], [12, 40, 4.4], [88, 10, 2.9],
];

/**
 * The live camera, filling the screen behind everything. It only counts as
 * "on" while pictures are really arriving: if the phone freezes or drops,
 * the celebrant's photo comes back instead of a stuck or black picture.
 */
function LiveVideo({ stream, onShowing, aspect }: { stream: MediaStream; onShowing: (on: boolean) => void; aspect: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  // Close to the screen's shape: fill it (the tiny crop isn't noticeable). Very different
  // (e.g. a phone held upright): show the whole picture, never zoomed, on a soft blurred copy of itself.
  const fill = Math.abs(videoAspect / aspect - 1) <= 0.22;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    let t: ReturnType<typeof setTimeout> | undefined;
    // A short freeze keeps the picture; a longer one brings the photo back.
    const onMute = () => { clearTimeout(t); t = setTimeout(() => setMuted(true), 1500); };
    const onUnmute = () => { clearTimeout(t); setMuted(false); };
    const onEnded = () => { clearTimeout(t); setMuted(true); };
    track?.addEventListener('mute', onMute);
    track?.addEventListener('unmute', onUnmute);
    track?.addEventListener('ended', onEnded);
    return () => {
      clearTimeout(t);
      track?.removeEventListener('mute', onMute);
      track?.removeEventListener('unmute', onUnmute);
      track?.removeEventListener('ended', onEnded);
      setPlaying(false);
      setMuted(false);
    };
  }, [stream]);

  const showing = playing && !muted;
  useEffect(() => {
    onShowing(showing);
  }, [showing, onShowing]);
  useEffect(() => () => onShowing(false), [onShowing]);

  return (
    <>
      {!fill && showing && <VideoBackdrop video={ref} />}
      <video
        ref={ref}
        className={`st-video${showing ? ' on' : ''}${fill ? '' : ' whole'}`}
        autoPlay
        playsInline
        muted
        onPlaying={() => setPlaying(true)}
        onResize={(ev) => {
          const v = ev.currentTarget;
          if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
        }}
      />
      <div className={`st-scrim${showing ? ' on' : ''}`} aria-hidden="true" />
    </>
  );
}

/**
 * Fills the space around a video that doesn't match the screen's shape with a
 * soft, blurred copy of it. Drawn tiny a few times a second and stretched by
 * the browser, so it costs almost nothing.
 */
function VideoBackdrop({ video }: { video: React.RefObject<HTMLVideoElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.filter = 'blur(2px)';
    const id = setInterval(() => {
      const v = video.current;
      if (v && v.videoWidth) ctx.drawImage(v, 0, 0, 64, 36);
    }, 160);
    return () => clearInterval(id);
  }, [video]);
  return <canvas ref={ref} className="st-video-fill" width={64} height={36} aria-hidden="true" />;
}

// Re-draw only when something on screen changes, not on every clock tick.
export default memo(StageScreen);

type ShownLine = { key: string; line: ScreenLine; until: number; leaving: boolean };

/**
 * Approved lines pop up around the celebrant, a few at a time, each for 2 to 5
 * seconds (longer lines stay longer), cycling through all of them endlessly.
 * A newly approved line jumps the queue.
 */
function LineCycler({ lines, arena, max, phone }: { lines: ScreenLine[]; arena: Arena; max: number; phone?: boolean }) {
  const [shown, setShown] = useState<ShownLine[]>([]);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const maxRef = useRef(max);
  maxRef.current = max;
  const next = useRef(0);
  const known = useRef<Set<string> | null>(null);
  const priority = useRef<string[]>([]);
  const lastPop = useRef(0);
  const count = useRef(0);

  // Newly approved lines go to the front of the queue.
  const key = lines.map((l) => l.id).join(',');
  useEffect(() => {
    const seen = known.current;
    if (seen) for (const l of lines) if (!seen.has(l.id)) priority.current.push(l.id);
    known.current = new Set(lines.map((l) => l.id));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setShown((cur) => {
        let list = cur
          .filter((s) => !(s.leaving && now >= s.until + 450)) // gone after fading out
          .map((s) => (!s.leaving && now >= s.until ? { ...s, leaving: true } : s));
        const ls = linesRef.current;
        const onScreen = new Set(list.map((s) => s.line.id));
        const active = list.filter((s) => !s.leaving).length;
        const room = Math.min(maxRef.current, ls.length);
        if (ls.length && active < room && now - lastPop.current >= LINE_GAP_MS) {
          let pick: ScreenLine | undefined;
          while (priority.current.length && !pick) {
            const pid = priority.current.shift()!;
            pick = ls.find((l) => l.id === pid && !onScreen.has(l.id));
          }
          for (let tries = 0; !pick && tries < ls.length; tries++) {
            const cand = ls[next.current % ls.length];
            next.current += 1;
            if (!onScreen.has(cand.id)) pick = cand;
          }
          if (pick) {
            lastPop.current = now;
            count.current += 1;
            list = [...list, { key: `l${pick.id}-${count.current}`, line: pick, until: now + lineDuration(pick.text), leaving: false }];
          }
        }
        return list.length === cur.length && list.every((s, i) => s === cur[i]) ? cur : list;
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {shown.map((s) => (
        <ArenaBody key={s.key} arena={arena} id={s.key} kind="line" leaving={s.leaving}>
          <div className={`ln-bubble${s.leaving ? ' leaving' : ''}`}>
            <div className="ln-head">
              <Avatar name={s.line.name} photo={s.line.photo} size={phone ? 30 : 46} />
              <span className="ln-name">{s.line.name}</span>
            </div>
            <div className="ln-text">“{s.line.text}”</div>
          </div>
        </ArenaBody>
      ))}
    </>
  );
}
