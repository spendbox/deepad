'use client';

import { useEffect, useRef, useState } from 'react';
import CopyButton from '@/components/CopyButton';
import FitText from '@/components/FitText';
import { groupAccountNumber, naira } from '@/lib/money';
import { getTheme } from '@/lib/themes';
import type { ScreenFeed, ScreenTransfer } from '@/lib/events';

const POLL_MS = 2000;
const SPRAY_HOLD_MS = 12000; // a spray stays up this long, then the screen invites more
const TAKEOVER_MS = 7000;
const PHOTO_MS = 7000; // each celebrant photo shows this long
const STAGE_W = 1920;
const STAGE_H = 1080;

type Props = { code: string; initialFeed: ScreenFeed };

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
}
function dayAndClock(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
}

export default function LiveScreen({ code, initialFeed }: Props) {
  const [feed, setFeed] = useState(initialFeed);
  const [online, setOnline] = useState(true);
  const seen = useRef(new Set(initialFeed.recent.map((t) => t.id)));
  const [queue, setQueue] = useState<ScreenTransfer[]>([]);
  const [current, setCurrent] = useState<ScreenTransfer | null>(null);
  const [shownAt, setShownAt] = useState(0);
  const [takeover, setTakeover] = useState<{ t: ScreenTransfer; at: number } | null>(null);
  const [popKey, setPopKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [scale, setScale] = useState(1);
  const [compact, setCompact] = useState(false);
  const [ready, setReady] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // --- Ask the server for new transfers. Keeps retrying if the internet drops. ---
  useEffect(() => {
    let alive = true;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/screen/${encodeURIComponent(code)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as ScreenFeed;
        if (!alive) return;
        fails = 0;
        setOnline(true);
        setFeed(data);
        const fresh = data.recent.filter((t) => !seen.current.has(t.id));
        fresh.forEach((t) => seen.current.add(t.id));
        if (fresh.length) setQueue((q) => [...q, ...fresh]);
        // Pick up changes to what's showing (e.g. the planner hid a message).
        setCurrent((c) => (c ? data.recent.find((t) => t.id === c.id) ?? c : c));
      } catch {
        fails += 1;
        if (alive) setOnline(false);
      }
      if (alive) timer = setTimeout(poll, fails ? Math.min(POLL_MS * 2 ** fails, 8000) : POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [code]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // --- Show queued transfers one at a time (faster when catching up). ---
  const paused = feed.event.paused;
  useEffect(() => {
    if (takeover) {
      if (now - takeover.at >= TAKEOVER_MS) {
        setTakeover(null);
        setShownAt(Date.now());
      }
      return;
    }
    if (!queue.length || paused) return;
    const gap = queue.length > 3 ? 2500 : 4500;
    if (shownAt && now - shownAt < gap) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    setShownAt(Date.now());
    setPopKey((k) => k + 1);
    if (feed.event.bigSprayKobo > 0 && next.amountKobo >= feed.event.bigSprayKobo) setTakeover({ t: next, at: Date.now() });
  }, [now, queue, paused, takeover, shownAt, feed.event.bigSprayKobo]);

  // --- Fit the 1920x1080 design to any TV or projector. ---
  useEffect(() => {
    const fit = () => {
      setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
      // Phones and narrow windows get a layout made for them instead of a tiny TV picture.
      setCompact(window.innerWidth < 900 || window.innerHeight > window.innerWidth);
      setReady(true);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // --- Keep the laptop awake while the screen is up. ---
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const grab = async () => {
      try {
        if (nav.wakeLock && document.visibilityState === 'visible') lock = await nav.wakeLock.request('screen');
      } catch {}
    };
    grab();
    document.addEventListener('visibilitychange', grab);
    return () => {
      document.removeEventListener('visibilitychange', grab);
      lock?.release().catch(() => {});
    };
  }, []);

  // --- Hide the full-screen button when the mouse is still. ---
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setShowControls(true);
      clearTimeout(t);
      t = setTimeout(() => setShowControls(false), 3000);
    };
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
    };
  }, []);

  const e = feed.event;
  const theme = getTheme(e.theme);
  const themeVars = {
    '--s-bg': theme.bg,
    '--s-panel': theme.panel,
    '--s-accent': theme.accent,
    '--s-on-accent': theme.onAccent,
    '--s-text': theme.text,
    '--s-muted': theme.muted,
  } as React.CSSProperties;

  const showingSpray = !!current && (queue.length > 0 || (shownAt > 0 && now - shownAt < SPRAY_HOLD_MS));
  const recent = feed.recent.filter((t) => !queue.some((q) => q.id === t.id)).slice(-6).reverse();
  const acct = e.accountNumber ? groupAccountNumber(e.accountNumber) : null;
  // Celebrant photos take turns, a new one every few seconds.
  const photo = e.photos.length ? e.photos[ready ? Math.floor(now / PHOTO_MS) % e.photos.length : 0] : null;

  const statusBadge = !online ? (
    <div className="badge offline" role="status">Reconnecting… transfers still work</div>
  ) : e.phase === 'live' ? (
    <div className="badge"><span className="live-dot" />{paused ? 'Paused' : 'Live'}</div>
  ) : null;

  const fullScreenButton = (
    <button
      type="button"
      className={`fs-btn${showControls ? '' : ' hidden'}`}
      onClick={() => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }}
    >
      Full screen
    </button>
  );

  // ---------- Phone layout (someone opened the link on their phone) ----------
  if (compact) {
    return (
      <div className="m-screen" style={themeVars}>
        <header className="m-top">
          <div style={{ minWidth: 0 }}>
            <div className="top-brand" style={{ fontSize: 16 }}>DashPad</div>
            <h1 className="m-title">{e.title}</h1>
          </div>
          {statusBadge}
        </header>

        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={photo} src={photo} alt={`Photo of ${e.celebrantName}`} className="m-photo fade-in" />
        )}

        {e.phase === 'upcoming' ? (
          <section className="m-card m-center">
            <div className="m-big">Spraying opens soon</div>
            <div>{dayAndClock(e.startsAt)}</div>
            <div className="m-muted">The account number will appear here when spraying starts.</div>
          </section>
        ) : e.phase === 'ended' ? (
          <section className="m-card m-center">
            <div className="m-big">Thank you for spraying {e.celebrantName}!</div>
            <div className="m-muted">Spraying has closed. Please don’t send more transfers.</div>
          </section>
        ) : (
          <>
            {acct ? (
              <section className="m-pay">
                <div className="m-pay-label">Transfer to spray</div>
                <div className="m-acct">{acct}</div>
                <div className="m-bank">{e.accountBank}</div>
                <div className="m-acct-name">{e.accountName}</div>
                <CopyButton text={e.accountNumber!} label="Copy account number" />
              </section>
            ) : (
              <section className="m-pay"><div className="m-bank">Account number coming soon</div></section>
            )}

            {takeover || (showingSpray && current) ? (
              <section key={popKey} className={`m-card spray-pop m-spray${takeover ? ' m-bigspray' : ''}`}>
                <Burst count={12} />
                <div className="m-badge">{takeover ? 'Big spray!' : 'New spray!'}</div>
                <div className="m-amount">{naira((takeover?.t ?? current!).amountKobo)}</div>
                <div className="m-to">sent to {e.recipientLabel}</div>
                {(takeover?.t ?? current!).message && <div className="m-msg">“{(takeover?.t ?? current!).message}”</div>}
              </section>
            ) : (
              <section className="m-card">
                <div className="m-big">Spray {e.celebrantName}!</div>
                <div className="m-muted">
                  Type a message in your transfer description and it will show on the big screen. It can take up to a
                  minute to appear.
                </div>
              </section>
            )}

            {recent.length > 0 && (
              <section className="m-card">
                <div className="m-to">Recent sprays</div>
                <ol className="m-recent">
                  {recent.map((t) => (
                    <li key={t.id}>
                      <strong>{naira(t.amountKobo)}</strong>
                      {t.message && <span>{t.message}</span>}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
        <p className="m-foot">It can take up to a minute for a transfer to show. Only confirmed transfers appear, and senders stay anonymous.</p>
      </div>
    );
  }

  // ---------- Big screen layout (TV or projector) ----------
  return (
    <div className="screen-root" style={themeVars}>
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <NotesRain />

        {takeover ? (
          <div className="takeover">
            <div className="takeover-badge">Big spray!</div>
            <FitText className="takeover-amount" text={naira(takeover.t.amountKobo)} max={300} />
            <div className="takeover-to">sent to {e.recipientLabel}</div>
            {takeover.t.message && <div className="takeover-msg">“{takeover.t.message}”</div>}
            {acct && (
              <div className="takeover-acct">
                <span>Transfer to spray</span>
                <strong>{acct}</strong>
                <span className="takeover-bank">{e.accountBank}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="layout">
            <header className="top">
              <div style={{ minWidth: 0 }}>
                <div className="top-brand">DashPad</div>
                <h1 className="top-title">{e.title}</h1>
              </div>
              <div className="top-right">
                {statusBadge}
                {e.phase === 'live' && <div className="top-note">Spraying closes {clock(e.endsAt)}</div>}
              </div>
            </header>

            {e.phase === 'upcoming' || e.phase === 'ended' ? (
              <section className="notice">
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={photo} src={photo} alt="" className="notice-photo fade-in" />
                )}
                <div className="notice-text">
                  {e.phase === 'upcoming' ? (
                    <>
                      <div className="notice-big">Spraying opens soon</div>
                      <div className="notice-sub">{dayAndClock(e.startsAt)}</div>
                      <div className="notice-sub muted">The account number will appear here when spraying starts.</div>
                    </>
                  ) : (
                    <>
                      <div className="notice-big">Thank you for spraying!</div>
                      <div className="notice-sub">{e.celebrantName} appreciates every one of you.</div>
                      <div className="notice-sub muted">Spraying has closed. Please don’t send more transfers.</div>
                    </>
                  )}
                </div>
              </section>
            ) : (
              <>
                <div className="middle">
                  {showingSpray && current ? (
                    <div key={popKey} className="panel-main spray-pop">
                      <Burst count={22} />
                      <div className="pop-kicker">New spray!</div>
                      <FitText className="pop-amount" text={naira(current.amountKobo)} max={190} />
                      <div className="pop-to">sent to {e.recipientLabel}</div>
                      {current.message && <div className="pop-msg">“{current.message}”</div>}
                    </div>
                  ) : (
                    <div className={`invite panel-main${photo ? ' with-photo' : ''}`}>
                      <div className="invite-text">
                        <div className="invite-big">Spray {e.celebrantName}!</div>
                        <div className="invite-sub">
                          Transfer any amount from your bank app to the account below. Type a message in the transfer
                          description and it will show here. It can take up to a minute to appear.
                        </div>
                      </div>
                      {photo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={photo} src={photo} alt="" className="invite-photo fade-in" />
                      )}
                    </div>
                  )}
                  <aside className="side">
                    <div className="side-list">
                      <h2>Recent sprays</h2>
                      {recent.length === 0 ? (
                        <p className="side-empty">Be the first to spray!</p>
                      ) : (
                        <ol>
                          {recent.map((t) => (
                            <li key={t.id}>
                              <span className="side-amt tabular">{naira(t.amountKobo)}</span>
                              {t.message && <span className="side-msg">{t.message}</span>}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </aside>
                </div>

                <footer className="paybar">
                  <div className="paybar-main">
                    {acct ? (
                      <>
                        <div className="paybar-label">Transfer to spray</div>
                        <FitText className="paybar-acct" text={acct} max={150} />
                        <div className="paybar-meta">
                          <span className="paybar-bank">{e.accountBank}</span>
                          {e.accountName && <span className="paybar-name">{e.accountName}</span>}
                        </div>
                      </>
                    ) : (
                      <div className="paybar-acct" style={{ fontSize: 72 }}>Account number coming soon</div>
                    )}
                  </div>
                  <div className="paybar-side">
                    <div>Your transfer description shows on screen. It can take up to a minute to appear.</div>
                    <div className="paybar-trust">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                      <span>Only confirmed transfers appear. Senders stay anonymous.</span>
                    </div>
                  </div>
                </footer>
              </>
            )}
          </div>
        )}
      </div>
      {fullScreenButton}
    </div>
  );
}

/** Naira notes exploding outwards: every spray gets a celebration, however small. */
const BURST = Array.from({ length: 24 }, (_, i) => {
  const angle = (i / 24) * Math.PI * 2 + (i % 3) * 0.35;
  const dist = 0.55 + ((i * 7) % 5) * 0.12;
  return {
    dx: `${Math.round(Math.cos(angle) * dist * 100)}%`,
    dy: `${Math.round(Math.sin(angle) * dist * 100)}%`,
    rot: `${((i * 83) % 360) - 180}deg`,
    delay: `${(i % 4) * 0.05}s`,
  };
});

function Burst({ count }: { count: number }) {
  return (
    <div className="burst" aria-hidden="true">
      <div className="burst-flash" />
      {BURST.slice(0, count).map((b, i) => (
        <span
          key={i}
          className="burst-note"
          style={{ '--dx': b.dx, '--dy': b.dy, '--rot': b.rot, animationDelay: b.delay } as React.CSSProperties}
        >
          ₦
        </span>
      ))}
    </div>
  );
}

const NOTES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37) % 96}%`,
  duration: `${(7 + (i % 5) * 1.3).toFixed(1)}s`,
  delay: `${(-(i * 1.7)).toFixed(1)}s`,
}));

function NotesRain() {
  return (
    <div className="rain" aria-hidden="true">
      {NOTES.map((n, i) => (
        <div key={i} className="note" style={{ left: n.left, animationDuration: n.duration, animationDelay: n.delay }}>₦</div>
      ))}
    </div>
  );
}
