'use client';

import { memo, useEffect, useState } from 'react';
import { ConfettiBurst, ConfettiRain } from '@/components/Confetti';
import FitText from '@/components/FitText';
import HypeText from '@/components/HypeText';
import Logo from '@/components/Logo';
import type { ScreenFeed, ScreenTransfer } from '@/lib/events';
import { hypeFor } from '@/lib/hype';
import { naira } from '@/lib/money';
import { isCutout } from '@/lib/photos';
import { luminance } from '@/lib/colors';
import type { ScreenTheme } from '@/lib/themes';

// The TV / projector layout, drawn at 1920x1080 and scaled to fit.
// Newest spray big at the bottom left with the sender's initials under it,
// the hype line dancing above it, older messages drifting back towards the
// celebrant (no list of amounts), confetti arcing from the spray onto the
// celebrant, and the account number always huge.

const ORIGIN = { x: 230, y: 620 };
const LAND_WITH_PHOTO: [number, number] = [1060, 1860];
const LAND_NO_PHOTO: [number, number] = [320, 1820];
const PEAK_Y: [number, number] = [40, 300];
const LAND_Y: [number, number] = [520, 780];
const STACK = 4; // newest + 3 drifting back
// Big spray: the theme's dark-on-accent colour with a soft glow behind the celebrant.
const BS_BACKGROUND = { color: 'var(--s-on-accent)', glow: 'var(--s-accent)', glowX: 1480, glowY: 460, glowRadius: 680 };

// Depth per age: [translateZ px, opacity, blur px]
const DEPTH: Record<number, [number, number, number]> = {
  0: [0, 1, 0],
  1: [-700, 0.6, 0.6],
  2: [-1500, 0.36, 1.4],
  3: [-2500, 0.18, 2.2],
};

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
}
function dayAndClock(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
}
/** "from T.M. · “Happy birthday!”": who sprayed (initials only) and their own words. */
function byLine(t: ScreenTransfer) {
  const from = `from ${t.initials ?? 'a guest'}`;
  return t.message ? `${from} · “${t.message}”` : from;
}

function initials(name: string) {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join(' & ');
}

/** Counts up to the amount, for the big spray. */
function useCountUp(target: number, ms = 1600) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(p >= 1 ? target : Math.round((target * eased) / 10000) * 10000);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

type Props = {
  e: ScreenFeed['event'];
  theme: ScreenTheme;
  acct: string | null;
  /** Sprays already shown, oldest first. */
  history: ScreenTransfer[];
  popKey: number;
  takeover: ScreenTransfer | null;
  paused: boolean;
  online: boolean;
  photo: string | null;
};

function StageScreen({ e, theme, acct, history, popKey, takeover, paused, online, photo }: Props) {
  const recent = history.slice(-STACK);
  const newest = recent[recent.length - 1] ?? null;
  const live = e.phase === 'live';
  const cutout = photo ? isCutout(photo) : false;
  const hype = newest ? hypeFor(newest.amountKobo, newest.id, e.hypeLines ?? [], e.celebrantName) : null;

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

      <div className="st-headline">
        <FitText
          className="st-h1"
          max={120}
          text={e.phase === 'upcoming' ? 'Spraying opens soon' : e.phase === 'ended' ? 'Thank you for spraying!' : `Spray ${e.celebrantName}!`}
        />
      </div>

      {/* The celebrant */}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={photo} src={photo} alt={`Photo of ${e.celebrantName}`} className={`st-photo fade-in${cutout ? ' cutout' : ''}`} />
      ) : (
        <div className="st-monogram" aria-hidden="true">{initials(e.celebrantName)}</div>
      )}

      {live ? (
        <>
          {/* Sprays: the newest in front, older messages drifting back towards the celebrant */}
          <div className="st-stack">
            {recent.length === 0 && <div className="st-first">Be the first to spray!</div>}
            {recent.map((t, i) => {
              const age = recent.length - 1 - i;
              const [z, op, blur] = DEPTH[age];
              const drifting = age > 0;
              return (
                <div
                  key={t.id}
                  className={`st-item${age === 0 ? ' newest' : ''}`}
                  style={{
                    transform: `perspective(1000px) translateZ(${z}px)`,
                    opacity: drifting && !t.message ? 0 : op,
                    filter: `blur(${blur}px)`,
                    zIndex: 10 - age,
                  }}
                >
                  <div className="st-amount" style={{ opacity: drifting ? 0 : 1 }}>{naira(t.amountKobo)}</div>
                  <div className={`st-said${drifting ? ' big' : ''}`}>{drifting ? `“${t.message}”` : byLine(t)}</div>
                </div>
              );
            })}
          </div>

          {newest && hype && (
            <div key={`h${popKey}`} className="st-hype" aria-live="polite">
              <div className="st-hype-in">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#E2A62B" strokeWidth="4.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M8 32 17 25M4 18h12M13 5l6 10" />
                </svg>
                <HypeText text={hype} />
              </div>
            </div>
          )}

          {/* Big sprays get the takeover instead (no second burst afterwards). */}
          {newest && !takeover && !(e.bigSprayKobo > 0 && newest.amountKobo >= e.bigSprayKobo) && (
            <ConfettiBurst
              burstKey={popKey}
              amountKobo={newest.amountKobo}
              origin={ORIGIN}
              landX={photo ? LAND_WITH_PHOTO : LAND_NO_PHOTO}
              peakY={PEAK_Y}
              landY={LAND_Y}
            />
          )}
        </>
      ) : (
        <div className="st-notice">
          {e.phase === 'upcoming' ? (
            <>
              <div className="st-notice-big">{dayAndClock(e.startsAt)}</div>
              <div className="st-notice-sub">The account number will appear here when spraying starts.</div>
            </>
          ) : (
            <>
              <div className="st-notice-big">{e.celebrantName} appreciates every one of you.</div>
              <div className="st-notice-sub">Spraying has closed. Please don’t send more transfers.</div>
            </>
          )}
        </div>
      )}

      <div className="st-rule" />

      {/* The account number: always on screen, as big as it goes */}
      <footer className="st-pay">
        {live && acct ? (
          <>
            <div className="st-pay-label">Transfer any amount to spray</div>
            <div className="st-pay-row">
              <FitText className="st-acct" text={acct} max={160} />
              <div className="st-bank-col">
                <FitText className="st-bank" text={e.accountBank ?? ''} max={96} />
                {e.accountName && <div className="st-acct-name">{e.accountName}</div>}
              </div>
            </div>
          </>
        ) : live ? (
          <div className="st-acct" style={{ fontSize: 96 }}>Account number coming soon</div>
        ) : (
          <div className="st-pay-label">Thank you for celebrating with DashPad.</div>
        )}
      </footer>

      {takeover && live && (
        <BigSpray key={`t${takeover.id}`} t={takeover} e={e} acct={acct} photo={photo} theme={theme} />
      )}
    </div>
  );
}

// Re-draw only when something on screen changes, not on every clock tick.
export default memo(StageScreen);

/** A big spray takes over the whole screen, opening from the newest spray. */
function BigSpray({
  t,
  e,
  acct,
  photo,
  theme,
}: {
  t: ScreenTransfer;
  e: ScreenFeed['event'];
  acct: string | null;
  photo: string | null;
  theme: ScreenTheme;
}) {
  const shown = useCountUp(t.amountKobo);
  const hype = hypeFor(t.amountKobo, t.id, e.hypeLines ?? [], e.celebrantName);
  const cutout = photo ? isCutout(photo) : false;
  return (
    <div className="bs" role="status">
      <ConfettiRain amountKobo={t.amountKobo} width={1920} height={1080} seed={t.id} background={BS_BACKGROUND} />
      <header className="st-top bs-top">
        <div className="st-top-left">
          <Logo size={30} tone={luminance(theme.onAccent) > 0.4 ? 'light' : 'dark'} />
          <span className="st-event">{e.title}</span>
        </div>
        <span className="st-status"><span className="st-dot" />Big spray!</span>
      </header>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className={`st-photo bs-photo${cutout ? ' cutout' : ''}`} />
      ) : (
        <div className="st-monogram bs-monogram" aria-hidden="true">{initials(e.celebrantName)}</div>
      )}
      <div className="bs-hype">
        <div className="st-hype-in">
          <svg width="46" height="46" viewBox="0 0 40 40" fill="none" stroke="#F6C35A" strokeWidth="4.5" strokeLinecap="round" aria-hidden="true">
            <path d="M8 32 17 25M4 18h12M13 5l6 10" />
          </svg>
          <HypeText text={hype} />
        </div>
      </div>
      <div className="bs-main">
        <FitText className="bs-amount" text={naira(shown)} max={230} />
        <div className="bs-said">{byLine(t)}</div>
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
