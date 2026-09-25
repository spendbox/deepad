'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import { ConfettiRain, SprayCanvas, type Emitter } from '@/components/Confetti';
import FitText from '@/components/FitText';
import HypeText from '@/components/HypeText';
import Logo from '@/components/Logo';
import { luminance } from '@/lib/colors';
import type { ScreenFeed, ScreenLine, ScreenTransfer } from '@/lib/events';
import { isCutout } from '@/lib/photos';
import type { ScreenTheme } from '@/lib/themes';

// The TV / projector layout, drawn at 1920x1080 and scaled to fit.
// The celebrant stands in the middle; everyone spraying appears around them
// as a name tag, throwing confetti onto them. Lines written by the planner
// and guests take turns on the left. The account number stays huge at the
// bottom. Amounts are never shown.

/** Where sprayers' name tags stand around the celebrant (tag centres, stage pixels). */
const SLOTS: { x: number; y: number }[] = [
  { x: 1690, y: 150 },
  { x: 810, y: 560 },
  { x: 1620, y: 290 },
  { x: 520, y: 600 },
  { x: 1730, y: 420 },
  { x: 760, y: 675 },
  { x: 1630, y: 550 },
  { x: 300, y: 670 },
  { x: 1730, y: 670 },
  { x: 1560, y: 90 },
];
export const SPRAY_SLOTS = SLOTS.length;

// The confetti canvas covers the area around the celebrant only (cheaper than the whole screen).
const CANVAS = { left: 150, top: 40, width: 1770, height: 712 };
const TARGET = { x: [1100 - CANVAS.left, 1380 - CANVAS.left] as [number, number], y: [200 - CANVAS.top, 540 - CANVAS.top] as [number, number] };
const LINE_MS = 7000; // each line stays up this long when there are several
const BS_BACKGROUND = { color: 'var(--s-on-accent)', glow: 'var(--s-accent)', glowX: 1480, glowY: 460, glowRadius: 680 };

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

type Props = {
  e: ScreenFeed['event'];
  theme: ScreenTheme;
  acct: string | null;
  sprayers: ActiveSprayer[];
  big: ScreenTransfer | null;
  paused: boolean;
  online: boolean;
  photo: string | null;
  lines: ScreenLine[];
  writeLink: string;
};

function StageScreen({ e, theme, acct, sprayers, big, paused, online, photo, lines, writeLink }: Props) {
  const live = e.phase === 'live';
  const cutout = photo ? isCutout(photo) : false;

  const emitters = useMemo<Emitter[]>(
    () =>
      live && !big
        ? sprayers
            .filter((s) => !s.leaving)
            .map((s) => ({
              id: s.t.id,
              x: SLOTS[s.slot].x - CANVAS.left,
              y: SLOTS[s.slot].y - CANVAS.top,
              perSecond: s.t.weight >= 3 ? 2 : s.t.weight === 2 ? 1.5 : 1, // one or two throws a second
            }))
        : [],
    [sprayers, live, big],
  );

  const status = !online ? (
    <span className="st-status offline" role="status">Reconnecting… transfers still work</span>
  ) : live ? (
    <span className="st-status"><span className="st-dot" />{paused ? 'Paused' : 'Live'}</span>
  ) : null;

  return (
    <div className="st">
      <header className="st-top">
        <div className="st-top-left">
          <Logo size={30} tone={theme.light ? 'light' : 'dark'} />
          <span className="st-event">{e.title}</span>
        </div>
        <div className="st-top-right">
          {status}
          {live && <span className="st-closes">Spraying closes {clock(e.endsAt)}</span>}
        </div>
      </header>

      {live ? <LineStack lines={lines} celebrantName={e.celebrantName} /> : (
        <div className="st-notice">
          <div className="st-notice-big">{e.phase === 'upcoming' ? 'Spraying opens soon' : 'Thank you for spraying!'}</div>
          <div className="st-notice-sub">
            {e.phase === 'upcoming'
              ? `${dayAndClock(e.startsAt)}. The account number appears here when spraying starts.`
              : `${e.celebrantName} appreciates every one of you. Spraying has closed.`}
          </div>
        </div>
      )}

      {/* The celebrant */}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={photo} src={photo} alt={`Photo of ${e.celebrantName}`} className={`st-photo fade-in${cutout ? ' cutout' : ''}`} />
      ) : (
        <div className="st-monogram" aria-hidden="true">{monogram(e.celebrantName)}</div>
      )}

      {/* Everyone spraying right now, around the celebrant */}
      {live && (
        <>
          <SprayCanvas emitters={emitters} target={TARGET} width={CANVAS.width} height={CANVAS.height} style={{ left: CANVAS.left, top: CANVAS.top, zIndex: 4 }} />
          <ul className="st-sprayers" aria-label="Spraying now">
            {sprayers.map((s) => (
              <li
                key={s.t.id}
                className={`sp-tag${s.leaving ? ' leaving' : ''}`}
                style={{ left: SLOTS[s.slot].x, top: SLOTS[s.slot].y, animationDelay: `${(s.t.id % 7) * -0.23}s` }}
              >
                <Avatar name={s.t.firstName ?? 'Guest'} size={56} letters={bubble(s.t)} />
                <span className="sp-name">{s.t.firstName ?? 'A guest'}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="st-rule" />

      {/* The account number: always on screen, as big as it goes */}
      <footer className="st-pay">
        {live && acct ? (
          <>
            <div className="st-pay-label">Transfer to spray</div>
            <FitText className="st-acct" text={acct} max={140} />
            <div className="st-bank-row">
              <span className="st-bank">{e.accountBank}</span>
              {e.accountName && <span className="st-acct-name">{e.accountName}</span>}
            </div>
          </>
        ) : live ? (
          <div className="st-acct" style={{ fontSize: 88 }}>Account number coming soon</div>
        ) : (
          <div className="st-pay-label">Thank you for celebrating with DashPad.</div>
        )}
      </footer>
      {live && (
        <aside className="st-side">
          <strong>Any amount is welcome</strong>
          <span>Transfers can take up to a minute to show on the screen.</span>
          <span className="st-write">Write a line: <b>{writeLink}</b></span>
        </aside>
      )}

      {big && live && <BigSpray key={`b${big.id}`} t={big} e={e} acct={acct} photo={photo} theme={theme} />}
    </div>
  );
}

// Re-draw only when something on screen changes, not on every clock tick.
export default memo(StageScreen);

/** Lines take turns: the current one in front, the last two drifting back. */
function LineStack({ lines, celebrantName }: { lines: ScreenLine[]; celebrantName: string }) {
  const [order, setOrder] = useState<string[]>([]); // line ids in the order they were shown
  // The screen refreshes every 2 seconds; only react when the lines themselves change.
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const key = lines.map((l) => l.id).join(',');

  // Show a brand-new line straight away; otherwise take turns every few seconds.
  useEffect(() => {
    const ls = linesRef.current;
    if (!ls.length) return;
    setOrder((o) => {
      const fresh = ls.find((l) => !o.includes(l.id));
      return o.length === 0 || fresh ? [...o.slice(-20), (fresh ?? ls[0]).id] : o;
    });
  }, [key]);
  useEffect(() => {
    if (linesRef.current.length < 2) return;
    const id = setInterval(() => {
      setOrder((o) => {
        const ls = linesRef.current;
        const current = ls.findIndex((l) => l.id === o[o.length - 1]);
        const next = ls[(current + 1) % ls.length] ?? ls[0];
        return [...o.slice(-20), next.id];
      });
    }, LINE_MS);
    return () => clearInterval(id);
  }, [key]);

  const byId = new Map(lines.map((l) => [l.id, l]));
  // The last three shown, most recent last, each line only once.
  const recent: ScreenLine[] = [];
  for (let i = order.length - 1; i >= 0 && recent.length < 3; i--) {
    const l = byId.get(order[i]);
    if (l && !recent.includes(l)) recent.unshift(l);
  }

  if (!recent.length) {
    return (
      <div className="st-lines">
        <div className="st-hello">Spray {celebrantName}!</div>
      </div>
    );
  }
  return (
    <div className="st-lines" aria-live="polite">
      {recent.map((l, i) => {
        const age = recent.length - 1 - i;
        return (
          <div key={l.id} className={`ln-item age-${age}`}>
            <div className="ln-head">
              <Avatar name={l.name} photo={l.photo} size={56} />
              <span className="ln-name">{l.name}</span>
            </div>
            <div className="ln-text">“{l.text}”</div>
          </div>
        );
      })}
    </div>
  );
}

/** A big spray takes over the whole screen for 15 seconds: the sprayer's name, huge. */
function BigSpray({ t, e, acct, photo, theme }: { t: ScreenTransfer; e: ScreenFeed['event']; acct: string | null; photo: string | null; theme: ScreenTheme }) {
  const cutout = photo ? isCutout(photo) : false;
  return (
    <div className="bs" role="status">
      <ConfettiRain width={1920} height={1080} seed={t.id} count={t.weight >= 4 ? 130 : 100} background={BS_BACKGROUND} />
      <header className="st-top bs-top">
        <div className="st-top-left">
          <Logo size={30} tone={luminance(theme.onAccent) > 0.4 ? 'light' : 'dark'} />
          <span className="st-event">{e.title}</span>
        </div>
      </header>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className={`st-photo bs-photo${cutout ? ' cutout' : ''}`} />
      ) : (
        <div className="st-monogram bs-monogram" aria-hidden="true">{monogram(e.celebrantName)}</div>
      )}
      <div className="bs-kicker"><HypeText text="Big spray!" /></div>
      <div className="bs-main">
        <div className="bs-who">
          <Avatar name={t.firstName ?? 'Guest'} size={150} letters={bubble(t)} className="bs-avatar" />
          <FitText className="bs-name" text={t.firstName ?? 'A guest'} max={200} />
        </div>
        <div className="bs-sub">is spraying {e.celebrantName}!</div>
      </div>
      <div className="bs-rule" />
      {acct && (
        <div className="bs-pay">
          <div className="bs-pay-label">Join the spray. Transfer any amount to</div>
          <div className="bs-pay-row">
            <span className="bs-acct">{acct}</span>
            <span className="bs-bank">{e.accountBank}</span>
          </div>
        </div>
      )}
    </div>
  );
}
