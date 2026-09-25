'use client';

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Arena, type BodyKind } from '@/components/arena';
import Avatar from '@/components/Avatar';
import { SprayCanvas } from '@/components/Confetti';
import FitText from '@/components/FitText';
import Logo from '@/components/Logo';
import type { ScreenFeed, ScreenLine, ScreenTransfer } from '@/lib/events';
import { isCutout } from '@/lib/photos';
import type { ScreenTheme } from '@/lib/themes';

// The TV / projector layout, drawn at 1920x1080 and scaled to fit.
// The celebrant stands in the middle. Everyone spraying floats around them as
// a name tag throwing confetti; approved lines pop up around them in turns.
// Name tags and lines drift and bounce off each other, so nothing overlaps.
// The account number stays huge at the bottom. Amounts are never shown.

export const SPRAY_SLOTS = 12; // people spraying at once; the rest wait their turn

/** Stage size in design pixels: at least 1920x1080, stretched to the screen's shape so nothing is letterboxed. */
export type StageSize = { w: number; h: number };
const CARD_SPACE = 366; // the transfer card along the bottom, and the gap above it

/**
 * Where everything goes on a stage of this size. The celebrant stands in the
 * middle, as tall as the screen allows (their lower half tucks behind the
 * transfer card); names and lines float either side.
 */
function layoutFor({ w, h }: StageSize) {
  const cx = w / 2;
  const photoTop = 64;
  const cutoutH = h - photoTop - 40; // most of the screen's height
  const photoH = h - CARD_SPACE - photoTop + 70; // framed photos: the bottom edge hides behind the card
  const half = Math.min(260, cutoutH * 0.27); // clear space kept around the celebrant
  const canvas = { left: 0, top: 60, width: Math.round(w), height: Math.round(h - 380) };
  return {
    arena: { x0: 50, y0: 118, x1: w - 50, y1: h - CARD_SPACE },
    zone: { x0: cx - half, y0: 60, x1: cx + half, y1: h - CARD_SPACE + 46 }, // nothing floats over (or above) the celebrant
    canvas,
    target: {
      x: [cx - 130, cx + 130] as [number, number],
      y: [200 - canvas.top, h - 520 - canvas.top] as [number, number],
    },
    cutout: { left: cx - cutoutH * 0.36, top: photoTop, width: cutoutH * 0.72, height: cutoutH },
    photo: { left: cx - photoH * 0.4, top: photoTop, width: photoH * 0.8, height: photoH },
    monogram: { left: cx - 210, top: (h - CARD_SPACE) / 2 - 170 },
  };
}
const MAX_LINES = 3; // lines on screen at once (fewer when a big crowd is spraying)
const LINE_GAP_MS = 1300; // time between one line popping up and the next

export type ActiveSprayer = { t: ScreenTransfer; slot: number; leaving: boolean };

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
};

function StageScreen({ e, theme, acct, sprayers, paused, online, photo, lines, video, size }: Props) {
  const [videoOn, setVideoOn] = useState(false);
  const live = e.phase === 'live';
  const cutout = photo ? isCutout(photo) : false;
  const layout = useMemo(() => layoutFor(size), [size]);
  const arena = useMemo(() => new Arena(layout.arena, [layout.zone]), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => arena.setBounds(layout.arena, [layout.zone]), [arena, layout]);
  useEffect(() => () => arena.stop(), [arena]);
  const { canvas } = layout;
  const spraying = sprayers.some((s) => !s.leaving);
  const crowd = sprayers.filter((s) => !s.leaving).length;

  const status = !online ? (
    <span className="st-status offline" role="status">Reconnecting… transfers still work</span>
  ) : live && videoOn && !paused ? (
    <span className="st-status cam"><span className="st-dot" />Live camera</span>
  ) : live ? (
    <span className="st-status"><span className="st-dot" />{paused ? 'Paused' : 'Live'}</span>
  ) : null;

  return (
    <div className={`st${videoOn ? ' video' : ''}`}>
      {video && <LiveVideo stream={video} onShowing={setVideoOn} />}
      <header className="st-top">
        <div className="st-top-left">
          <Logo size={30} tone={theme.light && !videoOn ? 'light' : 'dark'} />
          <span className="st-event">{e.title}</span>
        </div>
        <div className="st-top-right">
          {status}
          {live && <span className="st-closes">Spraying closes {clock(e.endsAt)}</span>}
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
          {!spraying && !lines.length && !videoOn && <div className="st-hello">Spray {e.celebrantName}!</div>}
          <SprayCanvas
            source={() => arena.emitters().map((m) => ({ ...m, x: m.x - canvas.left, y: m.y - canvas.top }))}
            active={spraying}
            target={layout.target}
            width={canvas.width}
            height={canvas.height}
            style={{ left: canvas.left, top: canvas.top, zIndex: 4 }}
          />
          <div className={`st-arena${crowd >= 7 ? ' packed' : crowd >= 4 ? ' crowd' : ''}`} aria-live="polite">
            {sprayers.map((s) => (
              <ArenaBody
                key={`s${s.t.id}`}
                arena={arena}
                id={`s${s.t.id}`}
                kind="sprayer"
                big={s.t.big}
                perSecond={s.t.big ? 4 : s.t.weight >= 3 ? 2 : s.t.weight === 2 ? 1.5 : 1}
                leaving={s.leaving}
              >
                <div className={`sp-tag${s.t.big ? ' big' : ''}${s.leaving ? ' leaving' : ''}`}>
                  {s.t.big && <span className="sp-badge">Big spray!</span>}
                  <Avatar name={s.t.firstName ?? 'Guest'} size={s.t.big ? 84 : 56} letters={bubble(s.t)} />
                  <span className="sp-name">{s.t.firstName ?? 'A guest'}</span>
                </div>
              </ArenaBody>
            ))}
            <LineCycler lines={lines} arena={arena} max={crowd >= 7 ? 1 : crowd >= 4 ? 2 : MAX_LINES} />
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
      <footer className={`st-pay${live && acct ? '' : ' quiet'}`}>
        {live && acct ? (
          <>
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
          </>
        ) : live ? (
          <div className="st-pay-quiet">Account number coming soon</div>
        ) : (
          <div className="st-pay-quiet">Thank you for celebrating with DashPad.</div>
        )}
      </footer>
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
 * The live camera, filling the screen behind everything. It only counts as
 * "on" while pictures are really arriving: if the phone freezes or drops,
 * the celebrant's photo comes back instead of a stuck or black picture.
 */
function LiveVideo({ stream, onShowing }: { stream: MediaStream; onShowing: (on: boolean) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [upright, setUpright] = useState(false);

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
      <video
        ref={ref}
        className={`st-video${showing ? ' on' : ''}${upright ? ' upright' : ''}`}
        autoPlay
        playsInline
        muted
        onPlaying={() => setPlaying(true)}
        // A phone held upright still fills the screen; keep the top of the picture (where faces are) in view.
        onResize={(ev) => setUpright(ev.currentTarget.videoHeight > ev.currentTarget.videoWidth)}
      />
      <div className={`st-scrim${showing ? ' on' : ''}`} aria-hidden="true" />
    </>
  );
}

// Re-draw only when something on screen changes, not on every clock tick.
export default memo(StageScreen);

type ShownLine = { key: string; line: ScreenLine; until: number; leaving: boolean };

/**
 * Approved lines pop up around the celebrant, a few at a time, each for 2 to 5
 * seconds (longer lines stay longer), cycling through all of them endlessly.
 * A newly approved line jumps the queue.
 */
function LineCycler({ lines, arena, max }: { lines: ScreenLine[]; arena: Arena; max: number }) {
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
              <Avatar name={s.line.name} photo={s.line.photo} size={46} />
              <span className="ln-name">{s.line.name}</span>
            </div>
            <div className="ln-text">“{s.line.text}”</div>
          </div>
        </ArenaBody>
      ))}
    </>
  );
}
