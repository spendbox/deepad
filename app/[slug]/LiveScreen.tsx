'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenFeed, ScreenTransfer } from '@/lib/events';
import { groupAccountNumber } from '@/lib/money';
import { isCutout } from '@/lib/photos';
import { keepAwake } from '@/lib/wake';
import { alertSoundBlocked, playAlert, unlockAlertSound } from '@/lib/alert-sound';
import { sprayDurationMs } from '@/lib/spray-pace';
import { resolveTheme, themeVars as toThemeVars } from '@/lib/themes';
import StageScreen, { type ActiveSprayer, type StageMode, type StageSize } from './StageScreen';
import { screenIdFor, useLiveCamera } from './useLiveCamera';
import './stage.css';

const POLL_MS = 2000;
const PHOTO_MS = 7000; // each celebrant photo shows this long
const JOIN_GAP_MS = 600; // new sprayers step in one after another, not all at once
const LEAVE_MS = 700; // time for a name tag to fade away
// Confetti and money rain over the whole screen for as long as anyone is spraying. Each new sprayer
// sets off a burst on top, longer and stronger for bigger sprays (by spray size, weight 1-4; big last).
const BURST_MS = [0, 3000, 4500, 6000, 8000];
const BIG_BURST_MS = 10000;
// The last person spraying stays (and keeps spraying) up to 2 more minutes, until someone new comes.
const LINGER_MS = 120_000;
// How many full name tags and small bubbles fit at once. Everyone spraying keeps their full name tag
// (with their hand throwing money) until the screen fills up; then the one spraying longest shrinks to a
// small bubble that keeps spraying, to make room. Bubbles beyond the limit bow out.
const LIMITS: Record<StageMode, { tags: number; minis: number }> = { tv: { tags: 8, minis: 14 }, phone: { tags: 3, minis: 5 } };
// Design sizes the layout is drawn at, then scaled (and stretched to the screen's shape).
const BASE: Record<StageMode, { w: number; h: number }> = { tv: { w: 1920, h: 1080 }, phone: { w: 540, h: 960 } };

type Props = { code: string; initialFeed: ScreenFeed };
type Sprayer = ActiveSprayer & { until: number; joinedAt: number; leftAt?: number; lingering?: boolean };

/** How long someone keeps spraying: one ₦100 note per throw, faster for bigger sprays (lib/spray-pace.ts). */
function stayMs(t: ScreenTransfer) {
  return sprayDurationMs(t.pieces || 1);
}

export default function LiveScreen({ code, initialFeed }: Props) {
  const [feed, setFeed] = useState(initialFeed);
  const [online, setOnline] = useState(true);
  const seen = useRef(new Set(initialFeed.recent.map((t) => t.id)));
  // The newest spray already known. Each poll asks for everything after it, so none are ever skipped.
  const lastId = useRef(initialFeed.recent.reduce((m, t) => Math.max(m, t.id), 0));
  const [waiting, setWaiting] = useState<ScreenTransfer[]>([]);
  const [sprayers, setSprayers] = useState<Sprayer[]>([]);
  const [burst, setBurst] = useState({ until: 0, big: false });
  // The screen was opened (or reloaded) while people were spraying: they carry on where they were.
  // The most recent ones get full name tags; others continue as small bubbles. If nobody's spray is
  // still going, the most recent sprayer lingers, as they would have on screen.
  useEffect(() => {
    const at = Date.now();
    const recent = initialFeed.recent.map((t) => ({ t, at: new Date(t.createdAt).getTime() }));
    const still = recent.filter(({ t, at: made }) => made + stayMs(t) > at + 2000).slice(-(LIMITS.tv.tags + LIMITS.tv.minis));
    const resumed: Sprayer[] = still.map(({ t, at: made }, i) => ({
      t, slot: i, leaving: false, mini: i < still.length - LIMITS.tv.tags, done: false, joinedAt: made, until: made + stayMs(t),
    }));
    const last = recent[recent.length - 1];
    if (!resumed.length && last && last.at + stayMs(last.t) + LINGER_MS > at) {
      resumed.push({ t: last.t, slot: 0, leaving: false, mini: false, done: true, joinedAt: last.at, lingering: true, until: last.at + stayMs(last.t) + LINGER_MS });
    }
    if (resumed.length) {
      setSprayers(resumed);
      // Still spraying: the burst of rain carries on too.
      const fresh = resumed.filter((s) => !s.mini);
      if (fresh.length) setBurst({ until: at + 4000, big: fresh.some((s) => s.t.big) });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
        // A name or comment that arrived late (some banks send it later; comments are checked first),
        // or a comment the planner just hid: update whoever is already spraying.
        const byId = new Map(data.recent.map((t) => [t.id, t]));
        const changed = (x: ScreenTransfer) => {
          const u = byId.get(x.id);
          return !!u && (u.firstName !== x.firstName || u.comment !== x.comment);
        };
        setSprayers((list) => (list.some((x) => changed(x.t)) ? list.map((x) => (changed(x.t) ? { ...x, t: byId.get(x.t.id)! } : x)) : list));
        setWaiting((list) => (list.some(changed) ? list.map((x) => (changed(x) ? byId.get(x.id)! : x)) : list));
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
    // The last person still spraying: if their spray runs out with nobody else spraying or waiting,
    // they carry on (up to 2 more minutes) so the screen isn't left empty; someone new replaces them.
    const othersSpraying = (me: Sprayer) => list.some((o) => o !== me && !o.leaving && now < o.until);
    let lingerTaken = list.some((s) => s.lingering && !s.leaving);
    list = list.map((s) => {
      if (s.leaving) return s;
      if (now >= s.until) {
        if (!s.lingering && !lingerTaken && !waiting.length && !othersSpraying(s)) {
          lingerTaken = true;
          // Alone on screen: back to the full name tag, resting (no longer throwing).
          return { ...s, lingering: true, done: true, mini: false, until: now + LINGER_MS };
        }
        return { ...s, leaving: true, leftAt: now }; // spray used up
      }
      return s;
    });
    if (live && !paused && waiting.length && now - lastJoin.current >= JOIN_GAP_MS) {
      const [next, ...rest] = waiting;
      {
        const until = now + stayMs(next);
        // Someone new: whoever was lingering on their own makes way.
        list = list.map((s) => (s.lingering && !s.leaving ? { ...s, leaving: true, leftAt: now } : s));
        // Screen full of name tags? The one spraying longest shrinks to a small bubble (still spraying) to make room.
        const tags = list.filter((s) => !s.mini && !s.leaving);
        if (tags.length >= limits.tags) {
          const oldest = tags.filter((s) => !s.t.big).sort((a, b) => a.joinedAt - b.joinedAt)[0] ?? tags.sort((a, b) => a.joinedAt - b.joinedAt)[0];
          list = list.map((s) => (s !== oldest ? s : minis < limits.minis ? { ...s, mini: true } : { ...s, leaving: true, leftAt: now }));
          if (minis < limits.minis) minis += 1;
        }
        // Too many bubbles: the one closest to finishing bows out.
        const bubbles = list.filter((s) => s.mini && !s.leaving);
        if (bubbles.length > limits.minis) {
          const first = bubbles.sort((a, b) => a.until - b.until)[0];
          list = list.map((s) => (s === first ? { ...s, leaving: true, leftAt: now } : s));
        }
        list = [...list, { t: next, slot: list.length, leaving: false, mini: false, done: false, joinedAt: now, until }];
        setWaiting(rest);
        lastJoin.current = now;
        // The bank-alert sound, as each new sprayer steps in (if the planner left it on).
        if (feed.event.alertSound) playAlert(next.big);
        // A fresh burst of rain for each new sprayer; bigger sprays, bigger burst.
        const len = next.big ? BIG_BURST_MS : BURST_MS[next.weight] ?? 3000;
        setBurst((b) => ({ until: Math.max(b.until, now + len), big: next.big || (b.big && b.until > now) }));
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

  // --- Browsers only allow sound after a click, tap or key press: the first one switches the alert sound on. ---
  const [soundBlocked, setSoundBlocked] = useState(false);
  useEffect(() => {
    const unlock = () => {
      unlockAlertSound().then((ok) => {
        setSoundBlocked(!ok && alertSoundBlocked());
        if (ok) for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.removeEventListener(ev, unlock);
      });
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, unlock);
    // It may already be allowed (e.g. this site was clicked before); if not, show the button.
    unlockAlertSound().then((ok) => setSoundBlocked(!ok));
    return () => {
      for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.removeEventListener(ev, unlock);
    };
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
  // It rains for as long as anyone is still spraying (so bigger sprays keep it going longer).
  const rainUntil = sprayers.reduce((m, s) => (s.leaving ? m : Math.max(m, s.until)), 0);
  // Only a new list when someone arrives or leaves, so the screen redraws only then.
  const sprayerKey = sprayers.map((s) => `${s.t.id}${s.leaving ? 'x' : ''}${s.mini ? 'm' : ''}${s.done ? 'd' : ''}${s.t.firstName ?? ''}|${s.t.comment ?? ''}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shownSprayers = useMemo<ActiveSprayer[]>(() => sprayers.map(({ t, slot, leaving, mini, done }) => ({ t, slot, leaving, mini, done })), [sprayerKey]);

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
  const soundHint = e.alertSound && soundBlocked && e.phase !== 'ended';
  const controlsOn = showControls || camMenu || !!camNotice || soundHint;
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
          burstUntil={burst.until}
          burstBig={burst.big}
          accountNumber={e.accountNumber}
        />
      </div>
      {/* Only on a computer, and only while the mouse moves: never seen on the projected picture. */}
      {!compact && (
      <div className={`scr-controls${controlsOn ? '' : ' hidden'}`}>
        {camNotice && !camMenu && <div className="cam-notice" role="status">{camNotice}</div>}
        {soundHint && !camMenu && (
          <button type="button" className="fs-btn take" onClick={() => unlockAlertSound().then((ok) => setSoundBlocked(!ok))}>
            🔔 Turn on the alert sound
          </button>
        )}
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
