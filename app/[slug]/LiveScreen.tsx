'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import CopyButton from '@/components/CopyButton';
import Logo from '@/components/Logo';
import type { ScreenFeed, ScreenTransfer } from '@/lib/events';
import { groupAccountNumber } from '@/lib/money';
import { isCutout } from '@/lib/photos';
import { resolveTheme, themeVars as toThemeVars } from '@/lib/themes';
import StageScreen, { SPRAY_SLOTS, type ActiveSprayer, type StageSize } from './StageScreen';
import { useLiveCamera } from './useLiveCamera';
import './stage.css';

const POLL_MS = 2000;
const BIG_STAY_MS = 15000; // a big sprayer's name stays up this long, bigger and glowing
const PHOTO_MS = 7000; // each celebrant photo shows this long
const JOIN_GAP_MS = 600; // new sprayers step in one after another, not all at once
const LEAVE_MS = 700; // time for a name tag to fade away
const STAY_MS = [0, 9000, 12000, 15000, 18000]; // how long someone sprays, by spray size (weight 1-4)
const STAGE_W = 1920;
const STAGE_H = 1080;

type Props = { code: string; initialFeed: ScreenFeed };
type Sprayer = ActiveSprayer & { until: number; leftAt?: number };

function dayAndClock(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
}

export default function LiveScreen({ code, initialFeed }: Props) {
  const [feed, setFeed] = useState(initialFeed);
  const [online, setOnline] = useState(true);
  const seen = useRef(new Set(initialFeed.recent.map((t) => t.id)));
  // The newest spray already known. Each poll asks for everything after it, so none are ever skipped.
  const lastId = useRef(initialFeed.recent.reduce((m, t) => Math.max(m, t.id), 0));
  const [waiting, setWaiting] = useState<ScreenTransfer[]>([]);
  const [sprayers, setSprayers] = useState<Sprayer[]>([]);
  const lastJoin = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [scale, setScale] = useState(1);
  const [size, setSize] = useState<StageSize>({ w: STAGE_W, h: STAGE_H });
  const [compact, setCompact] = useState(false);
  const [ready, setReady] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [camMenu, setCamMenu] = useState(false);

  // --- Ask the server for new transfers and lines. Keeps retrying if the internet drops. ---
  useEffect(() => {
    let alive = true;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/screen/${encodeURIComponent(code)}?after=${lastId.current}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as ScreenFeed;
        if (!alive) return;
        fails = 0;
        setOnline(true);
        setFeed(data);
        // Everyone new joins the line in the order they paid, even if many came at once.
        const fresh = data.recent.filter((t) => !seen.current.has(t.id)).sort((a, b) => a.id - b.id);
        fresh.forEach((t) => {
          seen.current.add(t.id);
          lastId.current = Math.max(lastId.current, t.id);
        });
        if (fresh.length) setWaiting((w) => [...w, ...fresh]);
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

  // --- Who is spraying: people step in, spray for a while, then make room. ---
  const paused = feed.event.paused;
  const live = feed.event.phase === 'live';
  useEffect(() => {
    // Name tags whose time is up fade away, then leave.
    if (sprayers.some((s) => (!s.leaving && now >= s.until) || (s.leaving && now - (s.leftAt ?? now) >= LEAVE_MS))) {
      setSprayers((list) =>
        list
          .filter((s) => !(s.leaving && now - (s.leftAt ?? now) >= LEAVE_MS))
          .map((s) => (!s.leaving && now >= s.until ? { ...s, leaving: true, leftAt: now } : s)),
      );
    }
    if (!live || paused || !waiting.length || now - lastJoin.current < JOIN_GAP_MS) return;
    const [next, ...rest] = waiting;
    const used = new Set(sprayers.map((s) => s.slot));
    const slot = Array.from({ length: SPRAY_SLOTS }, (_, i) => i).find((i) => !used.has(i));
    if (slot === undefined && !next.big) return; // everyone waits for a free spot (big sprayers go straight in)
    // A crowd waiting? Everyone sprays a little shorter so all get a turn.
    const stay = next.big ? BIG_STAY_MS : Math.max(6000, (STAY_MS[next.weight] ?? 9000) * (rest.length > 4 ? 0.5 : 1));
    setWaiting(rest);
    setSprayers((list) => [...list, { t: next, slot: slot ?? -1, leaving: false, until: now + stay }]);
    lastJoin.current = now;
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Fit the 1920x1080 design to any TV or projector. ---
  useEffect(() => {
    const fit = () => {
      // Designed at 1920x1080, then stretched to the screen's own shape so it fills it edge to edge (no black bands).
      const k = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
      setScale(k);
      setSize((old) => {
        const w = Math.round(window.innerWidth / k);
        const h = Math.round(window.innerHeight / k);
        return old.w === w && old.h === h ? old : { w, h };
      });
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
  // Live video of the celebrant: only on the big screen, never on guests' phones.
  const cam = useLiveCamera(code, feed.camera, ready && !compact && e.phase !== 'ended');
  const camNotice = cam.phoneNeedsKey
    ? 'A phone camera is trying to go live. To show it, open this screen with the “Open big screen” button in your DashPad dashboard.'
    : cam.source
      ? null
      : cam.phoneProblem;
  const colorsKey = JSON.stringify(e.themeColors ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = useMemo(() => resolveTheme(e.theme, e.themeColors), [e.theme, colorsKey]);
  const themeVars = toThemeVars(theme) as React.CSSProperties;
  const acct = e.accountNumber ? groupAccountNumber(e.accountNumber) : null;
  // Celebrant photos take turns, a new one every few seconds; cut-outs (background removed) first.
  const cutouts = e.photos.filter(isCutout);
  const pool = cutouts.length ? cutouts : e.photos;
  const photo = pool.length ? pool[ready ? Math.floor(now / PHOTO_MS) % pool.length : 0] : null;
  // Only a new list when someone arrives or leaves, so the screen redraws only then.
  const sprayerKey = sprayers.map((s) => `${s.t.id}${s.leaving ? 'x' : ''}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shownSprayers = useMemo<ActiveSprayer[]>(() => sprayers.map(({ t, slot, leaving }) => ({ t, slot, leaving })), [sprayerKey]);

  const statusBadge = !online ? (
    <div className="badge offline" role="status">Reconnecting… transfers still work</div>
  ) : live ? (
    <div className="badge"><span className="live-dot" />{paused ? 'Paused' : 'Live'}</div>
  ) : null;

  const fullScreenButton = (
    <button
      type="button"
      className="fs-btn"
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
    const active = sprayers.filter((s) => !s.leaving);
    const big = active.find((s) => s.t.big);
    return (
      <div className="m-screen" style={themeVars}>
        <header className="m-top">
          <div style={{ minWidth: 0 }}>
            <div className="top-brand"><Logo size={22} tone={theme.light ? 'light' : 'dark'} /></div>
            <h1 className="m-title">{e.title}</h1>
          </div>
          {statusBadge}
        </header>

        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={photo} src={photo} alt={`Photo of ${e.celebrantName}`} className={`m-photo fade-in${isCutout(photo) ? ' cutout' : ''}`} />
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

            {big && (
              <section key={big.t.id} className="m-card m-bigspray" role="status">
                <div className="m-badge">Big spray!</div>
                <div className="m-big-who">
                  <Avatar name={big.t.firstName ?? 'Guest'} size={56} letters={(big.t.initials ?? '?').replace(/\./g, '')} />
                  <span>{big.t.firstName ?? 'A guest'}</span>
                </div>
                <div className="m-muted">is spraying {e.celebrantName}!</div>
              </section>
            )}

            <section className="m-card">
              <div className="m-to">Spraying now</div>
              {active.length ? (
                <ul className="m-sprayers">
                  {active.map((s) => (
                    <li key={s.t.id}>
                      <Avatar name={s.t.firstName ?? 'Guest'} size={32} letters={(s.t.initials ?? '?').replace(/\./g, '')} />
                      {s.t.firstName ?? 'A guest'}
                    </li>
                  ))}
                </ul>
              ) : feed.recent.length ? (
                <>
                  <div className="m-muted">Recently sprayed:</div>
                  <ul className="m-sprayers recent">
                    {feed.recent.slice(-6).reverse().map((t) => (
                      <li key={t.id}>
                        <Avatar name={t.firstName ?? 'Guest'} size={32} letters={(t.initials ?? '?').replace(/\./g, '')} />
                        {t.firstName ?? 'A guest'}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="m-muted">Be the first to spray {e.celebrantName}! Transfer any amount to the account above.</div>
              )}
            </section>

            {feed.lines.length > 0 && (
              <section className="m-card">
                <div className="m-to">Lines for {e.celebrantName}</div>
                <ul className="m-lines">
                  {feed.lines.slice(0, 6).map((l) => (
                    <li key={l.id}>
                      <Avatar name={l.name} photo={l.photo} size={36} />
                      <div>
                        <strong>{l.name}</strong>
                        <p>“{l.text}”</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        <p className="m-foot">Transfers can take up to a minute to show. Only confirmed transfers appear, and amounts are never shown.</p>
      </div>
    );
  }

  // ---------- Big screen layout (TV or projector) ----------
  return (
    <div className="screen-root" style={themeVars}>
      <div className="stage" style={{ width: size.w, height: size.h, transform: `translate(-50%, -50%) scale(${scale})` }}>
        <StageScreen
          e={e}
          theme={theme}
          acct={acct}
          sprayers={shownSprayers}
          paused={paused}
          online={online}
          photo={photo}
          lines={feed.lines}
          video={cam.stream}
          size={size}
        />
      </div>
      <div className={`scr-controls${showControls || camMenu || camNotice ? '' : ' hidden'}`}>
        {camNotice && !camMenu && <div className="cam-notice" role="status">{camNotice}</div>}
        {camMenu && (
          <div className="cam-menu" role="menu">
            <div className="cam-menu-h">Show live video from</div>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!cam.localId}
              className={!cam.localId ? 'on' : ''}
              onClick={() => { cam.chooseLocal(null); setCamMenu(false); }}
            >
              <strong>A phone</strong>
              <span>
                {cam.canUsePhone
                  ? cam.source === 'phone' ? 'Showing now' : 'Open the camera link on a phone and tap Go live'
                  : 'Open this screen with “Open big screen” in your dashboard to use a phone'}
              </span>
            </button>
            {cam.devices.map((d) => (
              <button
                key={d.id}
                type="button"
                role="menuitemradio"
                aria-checked={cam.localId === d.id}
                className={cam.localId === d.id ? 'on' : ''}
                onClick={() => { cam.chooseLocal(d.id); setCamMenu(false); }}
              >
                <strong>{d.label}</strong>
                <span>{cam.localId === d.id ? (cam.source === 'local' ? 'Showing now' : 'Starting…') : 'Plugged into this computer'}</span>
              </button>
            ))}
            {!cam.devices.length && <p className="cam-menu-note">No camera plugged into this computer.</p>}
            {cam.localError && <p className="cam-menu-note err">{cam.localError}</p>}
          </div>
        )}
        <button
          type="button"
          className={`fs-btn${cam.source ? ' live' : ''}`}
          aria-expanded={camMenu}
          onClick={() => { if (!camMenu) cam.refreshDevices(); setCamMenu(!camMenu); }}
        >
          {cam.source ? '● Camera' : 'Camera'}
        </button>
        {fullScreenButton}
      </div>
    </div>
  );
}
