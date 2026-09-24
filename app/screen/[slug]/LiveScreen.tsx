'use client';

import { useEffect, useRef, useState } from 'react';
import FitText from '@/components/FitText';
import { groupAccountNumber, naira } from '@/lib/money';
import type { ScreenFeed } from '@/lib/screen-feed';
import type { ScreenSpray } from '@/lib/sprays';

const POLL_MS = 2000;
const SPRAY_HOLD_MS = 9000; // how long a new spray stays before the screen goes back to "pay here"
const IDLE_SWAP_MS = 10000; // when quiet, swap between the big account number and the last spray
const TAKEOVER_MS = 7000;
const STAGE_W = 1920;
const STAGE_H = 1080;

type Props = { slug: string; initialFeed: ScreenFeed; qrSvg: string; guestUrl: string };

export default function LiveScreen({ slug, initialFeed, qrSvg, guestUrl }: Props) {
  const [feed, setFeed] = useState(initialFeed);
  const [online, setOnline] = useState(true);
  const seen = useRef(new Set(initialFeed.recent.map((s) => s.id)));
  const [queue, setQueue] = useState<ScreenSpray[]>([]);
  const [current, setCurrent] = useState<ScreenSpray | null>(initialFeed.recent.at(-1) ?? null);
  const [shownAt, setShownAt] = useState(0);
  const [takeover, setTakeover] = useState<{ spray: ScreenSpray; at: number } | null>(null);
  const [popKey, setPopKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [scale, setScale] = useState(1);
  const [openedAt] = useState(() => Date.now());
  const [showControls, setShowControls] = useState(true);

  // --- Ask the server for new sprays. Keeps retrying if the internet drops. ---
  useEffect(() => {
    let alive = true;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/screen/${encodeURIComponent(slug)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as ScreenFeed;
        if (!alive) return;
        fails = 0;
        setOnline(true);
        setFeed(data);
        const fresh = data.recent.filter((s) => !seen.current.has(s.id));
        fresh.forEach((s) => seen.current.add(s.id));
        if (fresh.length) setQueue((q) => [...q, ...fresh]);
        // Pick up changes to what's on screen now (e.g. MC hid the message).
        setCurrent((c) => (c ? data.recent.find((s) => s.id === c.id) ?? c : c));
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
  }, [slug]);

  // --- Clock ---
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // --- Play queued sprays one at a time (faster when catching up). ---
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
    if (feed.event.bigSprayKobo > 0 && next.amountKobo >= feed.event.bigSprayKobo) {
      setTakeover({ spray: next, at: Date.now() });
    }
  }, [now, queue, paused, takeover, shownAt, feed.event.bigSprayKobo]);

  // --- Fit the 1920x1080 design to whatever screen or projector this is. ---
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // --- Stop the laptop from going to sleep while the screen is up. ---
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

  // Totals on screen only include sprays that have already popped up.
  const queuedKobo = queue.reduce((sum, s) => sum + s.amountKobo, 0);
  const totalKobo = feed.stats.totalKobo - queuedKobo;
  const count = feed.stats.count - queue.length;

  // When quiet, alternate: big account number + QR first, then the last spray.
  let mode: 'spray' | 'hero';
  if (paused || !current) mode = 'hero';
  else if (!shownAt) mode = Math.floor((now - openedAt) / IDLE_SWAP_MS) % 2 === 0 ? 'hero' : 'spray';
  else if (now - shownAt < SPRAY_HOLD_MS || queue.length) mode = 'spray';
  else mode = Math.floor((now - shownAt - SPRAY_HOLD_MS) / IDLE_SWAP_MS) % 2 === 0 ? 'hero' : 'spray';

  const e = feed.event;
  const acct = e.accountNumber ? groupAccountNumber(e.accountNumber) : null;
  const acctMeta = [e.accountBank, e.accountName].filter(Boolean).join(' · ');
  const leader = feed.stats.leaderboard[0];

  const qr = <div className="qr" aria-label={`QR code for ${guestUrl}`} role="img" dangerouslySetInnerHTML={{ __html: qrSvg }} />;

  return (
    <div className="screen-root">
      <div
        className="stage"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <NotesRain />

        {takeover ? (
          <div className="takeover">
            <div className="takeover-badge">Big spray!</div>
            <div className="takeover-name">{takeover.spray.name}</div>
            <div className="takeover-amount">{naira(takeover.spray.amountKobo)}</div>
            {!takeover.spray.anonymous && leader && leader.name.toLowerCase() === takeover.spray.name.toLowerCase() && (
              <div className="takeover-top">
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" />
                </svg>
                Now number 1 on the leaderboard
              </div>
            )}
            {takeover.spray.message && <div className="takeover-msg">“{takeover.spray.message}”</div>}
            {acct && (
              <div className="takeover-acct">
                <span>Transfer to spray</span>
                <strong>{acct}</strong>
                <span>{e.accountBank}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="layout">
            <header className="top">
              <div>
                <div className="top-brand">DashPad</div>
                <h1 className="top-title">{e.title}</h1>
              </div>
              <div className="top-right">
                {online ? (
                  <div className="live-badge">
                    <span className="live-dot" />
                    <span>{paused ? 'Paused' : 'Live'}</span>
                  </div>
                ) : (
                  <div className="live-badge offline" role="status">Reconnecting… guests can still pay</div>
                )}
                {e.mcName && <div className="top-mc">Your host: {e.mcName}</div>}
              </div>
            </header>

            {mode === 'hero' ? (
              <section className="hero" aria-label="How to spray">
                <div className="hero-left">
                  <div className="hero-kicker">Spray {e.celebrants}</div>
                  {acct ? (
                    <>
                      <div className="hero-label">Transfer any amount to</div>
                      <FitText className="hero-acct" text={acct} max={196} />
                      <div className="hero-meta">{acctMeta}</div>
                      <div className="hero-note">Your bank account name and transfer description show on screen.</div>
                    </>
                  ) : (
                    <div className="hero-acct small">Scan the code to spray</div>
                  )}
                </div>
                <div className="hero-right">
                  {qr}
                  <div className="hero-qr-label">Or scan to add your name &amp; message</div>
                </div>
                <div className="hero-foot">
                  <span className="tabular">{naira(totalKobo)} sprayed so far · {count.toLocaleString('en-NG')} sprays</span>
                  <span>Only confirmed payments appear on screen. No fake alerts.</span>
                </div>
              </section>
            ) : (
              <>
                <div className="middle">
                  <div className="left-col">
                    {current && (
                      <div key={popKey} className="latest pop">
                        <div className="latest-label">Just sprayed</div>
                        <div className="latest-name">{current.name}</div>
                        <div className="latest-amount">{naira(current.amountKobo)}</div>
                        {current.message && <div className="latest-msg">“{current.message}”</div>}
                      </div>
                    )}
                    <div className="stats">
                      <div className="stat">
                        <div className="stat-v tabular">{naira(totalKobo)}</div>
                        <div className="stat-k">sprayed so far</div>
                      </div>
                      <div className="stat">
                        <div className="stat-v tabular">{count.toLocaleString('en-NG')}</div>
                        <div className="stat-k">sprays tonight</div>
                      </div>
                      {e.nextUp && (
                        <div className="stat green">
                          <div className="stat-v next">{e.nextUp}</div>
                          <div className="stat-k">coming up</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <aside className="board">
                    <div className="board-head">
                      <h2>Top sprayers</h2>
                      <span>tonight</span>
                    </div>
                    <ol>
                      {feed.stats.leaderboard.map((r, i) => (
                        <li key={r.name} className={i === 0 ? 'first' : ''}>
                          <span className="rank">{i + 1}</span>
                          <span className="board-name">{r.name}</span>
                          <span className="board-amt tabular">{naira(r.amountKobo)}</span>
                        </li>
                      ))}
                      {feed.stats.leaderboard.length === 0 && <li className="empty">Be the first to spray!</li>}
                    </ol>
                  </aside>
                </div>

                <footer className="paybar">
                  {qr}
                  <div className="paybar-main">
                    {acct ? (
                      <>
                        <div className="paybar-label">Transfer to spray</div>
                        <FitText className="paybar-acct" text={acct} max={124} />
                        <div className="paybar-meta">{acctMeta}</div>
                      </>
                    ) : (
                      <div className="paybar-acct">Scan to spray</div>
                    )}
                  </div>
                  <div className="paybar-side">
                    <div>Scan the code to add your name &amp; message. Direct transfers show your bank account name.</div>
                    <div className="paybar-trust">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                      <span>Only confirmed payments appear on screen. No fake alerts.</span>
                    </div>
                  </div>
                </footer>
              </>
            )}
          </div>
        )}
      </div>

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
        <div key={i} className="note" style={{ left: n.left, animationDuration: n.duration, animationDelay: n.delay }}>
          ₦
        </div>
      ))}
    </div>
  );
}
