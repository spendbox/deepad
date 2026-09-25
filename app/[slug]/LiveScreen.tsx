'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenFeed, ScreenTransfer } from '@/lib/events';
import { groupAccountNumber } from '@/lib/money';
import { isCutout } from '@/lib/photos';
import { keepAwake } from '@/lib/wake';
import { resolveTheme, themeVars as toThemeVars } from '@/lib/themes';
import StageScreen, { type ActiveSprayer, type StageMode, type StageSize } from './StageScreen';
import { screenIdFor, useLiveCamera } from './useLiveCamera';
import './stage.css';

const POLL_MS = 2000;
const PHOTO_MS = 7000; // each celebrant photo shows this long
const JOIN_GAP_MS = 600; // new sprayers step in one after another, not all at once
const LEAVE_MS = 700; // time for a name tag to fade away
const PIECE_MS = 1000; // each sprayer throws one piece of confetti a second (one per ₦200 sprayed)
const MIN_STAY_MS = 8000; // even a small spray stays long enough to read the name
const TAG_MS = 12000; // the big name tag, before it becomes a small bubble that keeps spraying
const BIG_TAG_MS = 15000; // a big sprayer's tag stays up this long, bigger and glowing
const RAIN_MS = 7000; // confetti and money rain over the whole screen after each spray…
const BIG_RAIN_MS = 15000; // …and longer after a big one
// How many name tags and small bubbles fit at once, before others wait (tags) or bow out (bubbles).
const LIMITS: Record<StageMode, { tags: number; minis: number }> = { tv: { tags: 8, minis: 14 }, phone: { tags: 3, minis: 5 } };
// Design sizes the layout is drawn at, then scaled (and stretched to the screen's shape).
const BASE: Record<StageMode, { w: number; h: number }> = { tv: { w: 1920, h: 1080 }, phone: { w: 540, h: 960 } };

type Props = { code: string; initialFeed: ScreenFeed };
type Sprayer = ActiveSprayer & { until: number; tagUntil: number; leftAt?: number };

/** How long someone keeps spraying: one piece a second, one piece per ₦200 (at most 30 minutes). */
function stayMs(t: ScreenTransfer) {
  return Math.max(MIN_STAY_MS, (t.pieces || 1) * PIECE_MS);
}

export default function LiveScreen({ code, initialFeed }: Props) {
  const [feed, setFeed] = useState(initialFeed);
  const [online, setOnline] = useState(true);
  const seen = useRef(new Set(initialFeed.recent.map((t) => t.id)));
  // The newest spray already known. Each poll asks for everything after it, so none are ever skipped.
  const lastId = useRef(initialFeed.recent.reduce((m, t) => Math.max(m, t.id), 0));
  const [waiting, setWaiting] = useState<ScreenTransfer[]>([]);
  const [sprayers, setSprayers] = useState<Sprayer[]>([]);
  // People whose spray is still going (e.g. after the screen was reloaded) carry on as small bubbles.
  useEffect(() => {
    const at = Date.now();
    const still = initialFeed.recent
      .filter((t) => new Date(t.createdAt).getTime() + stayMs(t) > at + 5000)
      .slice(-LIMITS.tv.minis)
      .map((t, i) => ({ t, slot: i, leaving: false, mini: true, tagUntil: at, until: new Date(t.createdAt).getTime() + stayMs(t) }));
    if (still.length) setSprayers(still);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [rainUntil, setRainUntil] = useState(0);
  const lastJoin = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [scale, setScale] = useState(1);
  const [size, setSize] = useState<StageSize>(BASE.tv);
  const [compact, setCompact] = useState(false);
  const [ready, setReady] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [camMenu, setCamMenu] = useState(false);
  const [sid, setSid] = useState<string | null>(null);
  const sidRef = useRef<string | null>(null);
  useEffect(() => {
    sidRef.current = screenIdFor(code);
    setSid(sidRef.current);
  }, [code]);

  // --- Ask the server for new transfers and lines. Keeps retrying if the internet drops. ---
  useEffect(() => {
    let alive = true;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const sidQ = sidRef.current ? `&sid=${sidRef.current}` : '';
        const res = await fetch(`/api/screen/${encodeURIComponent(code)}?after=${lastId.current}${sidQ}`, { cache: 'no-store' });
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
        // Big sprays skip the queue and show straight away.
        if (fresh.length) setWaiting((w) => [...fresh.filter((t) => t.big), ...w, ...fresh.filter((t) => !t.big)]);
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
  const mode: StageMode = compact ? 'phone' : 'tv';
  useEffect(() => {
    const limits = LIMITS[mode];
    let list = sprayers.filter((s) => !(s.leaving && now - (s.leftAt ?? now) >= LEAVE_MS)); // faded out: gone
    let minis = list.filter((s) => s.mini && !s.leaving).length;
    list = list.map((s) => {
      if (s.leaving) return s;
      if (now >= s.until) return { ...s, leaving: true, leftAt: now }; // spray used up
      if (!s.mini && now >= s.tagUntil) {
        // The big tag makes way for others; the person keeps spraying as a small bubble (if there's room).
        if (minis < limits.minis) {
          minis += 1;
          return { ...s, mini: true };
        }
        return { ...s, leaving: true, leftAt: now };
      }
      return s;
    });
    if (live && !paused && waiting.length && now - lastJoin.current >= JOIN_GAP_MS) {
      const [next, ...rest] = waiting;
      const tags = list.filter((s) => !s.mini && !s.leaving).length;
      if (tags < limits.tags || next.big) {
        const until = now + stayMs(next);
        // A crowd waiting? Tags make way sooner so everyone gets a turn.
        const tagMs = next.big ? BIG_TAG_MS : Math.max(6000, TAG_MS * (rest.length > 4 ? 0.5 : 1));
        list = [...list, { t: next, slot: list.length, leaving: false, mini: false, tagUntil: Math.min(until, now + tagMs), until }];
        setWaiting(rest);
        lastJoin.current = now;
        setRainUntil((r) => Math.max(r, now + (next.big ? BIG_RAIN_MS : RAIN_MS)));
      }
    }
    if (list.length !== sprayers.length || list.some((s, i) => s !== sprayers[i])) setSprayers(list);
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Fit the design to any screen: a TV or projector, or a phone. ---
  useEffect(() => {
    const fit = () => {
      // Phones and narrow windows get the same stage, laid out for a phone, instead of a tiny TV picture.
      const small = window.innerWidth < 900 || window.innerHeight > window.innerWidth;
      const base = BASE[small ? 'phone' : 'tv'];
      // Drawn at the design size, then stretched to the screen's own shape so it fills it edge to edge.
      const k = Math.min(window.innerWidth / base.w, window.innerHeight / base.h);
      setScale(k);
      setSize((old) => {
        const w = Math.round(window.innerWidth / k);
        const h = Math.round(window.innerHeight / k);
        return old.w === w && old.h === h ? old : { w, h };
      });
      setCompact(small);
      setReady(true);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // --- Keep the laptop awake while the screen is up (asking again whenever the system drops it). ---
  useEffect(() => keepAwake(), []);

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
  const cam = useLiveCamera(code, sid, feed.camera, ready && !compact && e.phase !== 'ended');
  const camNotice = cam.source ? null : cam.phoneProblem;
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
  const sprayerKey = sprayers.map((s) => `${s.t.id}${s.leaving ? 'x' : ''}${s.mini ? 'm' : ''}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shownSprayers = useMemo<ActiveSprayer[]>(() => sprayers.map(({ t, slot, leaving, mini }) => ({ t, slot, leaving, mini })), [sprayerKey]);

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

  // ---------- The big screen (the same stage on a TV, a laptop or a phone) ----------
  const controlsOn = showControls || camMenu || !!camNotice;
  return (
    <div className={`screen-root${controlsOn ? '' : ' idle'}`} style={themeVars}>
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
          video={compact ? null : cam.stream}
          size={size}
          mode={mode}
          rainUntil={rainUntil}
          accountNumber={e.accountNumber}
        />
      </div>
      {/* Only on a computer, and only while the mouse moves: never seen on the projected picture. */}
      {!compact && (
      <div className={`scr-controls${controlsOn ? '' : ' hidden'}`}>
        {camNotice && !camMenu && <div className="cam-notice" role="status">{camNotice}</div>}
        {cam.canTakeOver && !camMenu && (
          <button type="button" className="fs-btn take" disabled={cam.claiming} onClick={cam.takeOver}>
            {cam.claiming ? 'Switching…' : 'Show camera on this screen'}
          </button>
        )}
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
                {cam.source === 'phone'
                  ? 'Showing now'
                  : cam.canTakeOver
                    ? 'A phone is live on another screen. Use “Show camera on this screen”.'
                    : 'Open the camera link on a phone and tap Go live'}
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
      )}
    </div>
  );
}
