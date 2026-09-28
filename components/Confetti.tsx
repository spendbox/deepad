'use client';

import { useEffect, useRef } from 'react';
import './confetti.css';

// All confetti is drawn on a <canvas>: one layer the browser can paint
// cheaply, instead of hundreds of moving page elements. That keeps the big
// screen smooth even with many people spraying at once.

export const CONFETTI_COLORS = ['var(--s-accent)', '#F4A6CB', '#E2A62B', '#F6D38A', '#5B1E6B', '#FFFFFF', '#1F7A5C'];

/** The coins that fly on the big screen: gold and silver naira coins, catching the light as they spin. */
export const COINS = [
  { rim: '#8A5A12', face: '#F2C44E', shine: '#FFF1B8', deep: '#B7801F', mark: '#7A4E0E' }, // gold
  { rim: '#6F7479', face: '#D9DDE1', shine: '#FFFFFF', deep: '#9CA3AA', mark: '#4F555B' }, // silver
  { rim: '#8B4A1C', face: '#E7A15A', shine: '#FFE0BC', deep: '#B06A2E', mark: '#6E3512' }, // bronze
];

/** A naira coin, drawn once at twice its size so it stays sharp. */
export function coinSprite(c: (typeof COINS)[number]): HTMLCanvasElement {
  const D = 64;
  const R = D / 2;
  const cv = document.createElement('canvas');
  cv.width = D * 2;
  cv.height = D * 2;
  const g = cv.getContext('2d')!;
  g.scale(2, 2);
  // The rim
  g.fillStyle = c.rim;
  g.beginPath();
  g.arc(R, R, R, 0, Math.PI * 2);
  g.fill();
  // The face, lit from the top left
  const face = g.createRadialGradient(R * 0.7, R * 0.6, 2, R, R, R);
  face.addColorStop(0, c.shine);
  face.addColorStop(0.45, c.face);
  face.addColorStop(1, c.deep);
  g.fillStyle = face;
  g.beginPath();
  g.arc(R, R, R - 3, 0, Math.PI * 2);
  g.fill();
  // A raised ring of beads just inside the edge
  g.fillStyle = c.mark;
  g.globalAlpha = 0.55;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    g.beginPath();
    g.arc(R + Math.cos(a) * (R - 7.5), R + Math.sin(a) * (R - 7.5), 1.1, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // ₦ in the middle, stamped in (a light edge under it, like a raised letter)
  g.font = '900 34px Arial, Helvetica, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.fillText('₦', R, R + 2.2);
  g.fillStyle = c.mark;
  g.fillText('₦', R, R + 1.2);
  // A glint
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.beginPath();
  g.ellipse(R * 0.62, R * 0.5, 7, 3.2, -0.7, 0, Math.PI * 2);
  g.fill();
  return cv;
}

/** A little random number generator that gives the same pieces for the same seed. */
function seeded(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return (a: number, b: number) => {
    s = (s * 16807) % 2147483647;
    return a + ((s - 1) / 2147483646) * (b - a);
  };
}

function reducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function resolveColors(el: Element) {
  const css = getComputedStyle(el);
  const accent = css.getPropertyValue('--s-accent').trim() || '#B3136F';
  return CONFETTI_COLORS.map((c) => (c.startsWith('var(') ? accent : c));
}

type Piece = {
  x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; // arc from the sprayer to the celebrant
  born: number; fly: number; fall: number;
  w: number; h: number; round: boolean; color: string; rot: number; vr: number; flip: number; vf: number; drift: number;
  note: number; // -1 for confetti, else which coin picture
};

/** Someone spraying. `money` (0 to 1): how many of their throws are coins rather than confetti. */
export type Emitter = { id: number; x: number; y: number; perSecond: number; money?: number; note?: number };

/**
 * People spraying: every emitter (a sprayer's name on screen) throws naira
 * coins (and confetti, if `money` is under 1) at its own pace, spinning and
 * glinting as they arc onto the celebrant's
 * `target` area, where it flutters down and fades. Coordinates are in the
 * canvas's own pixels. The drawing loop stops when nobody is spraying.
 */
export function SprayCanvas({
  emitters,
  source,
  active,
  target,
  width,
  height,
  className = '',
  style,
}: {
  emitters?: Emitter[];
  /** Live positions (e.g. from moving name tags), asked for every frame instead of `emitters`. */
  source?: () => Emitter[];
  /** With `source`: true while anyone is spraying, to wake the drawing loop. */
  active?: boolean;
  target: { x: [number, number]; y: [number, number] };
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const read = () => (source ? source() : emitters ?? []);
  const readRef = useRef(read);
  const kick = useRef<() => void>(() => {});
  readRef.current = read;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || reducedMotion()) return;
    const colors = resolveColors(canvas);
    const r = seeded(Date.now());
    const coins = COINS.map(coinSprite);
    const pieces: Piece[] = [];
    const nextAt = new Map<number, number>();
    let raf = 0;
    let running = false;

    const spawn = (e: Emitter, now: number) => {
      const isNote = r(0, 1) < (e.money ?? 0);
      const ribbon = r(0, 1) < 0.65;
      const w = isNote ? r(40, 52) : ribbon ? r(20, 30) : r(11, 15);
      const x1 = r(target.x[0], target.x[1]);
      const y1 = r(target.y[0], target.y[1]);
      pieces.push({
        x0: e.x, y0: e.y, x1, y1,
        cx: (e.x + x1) / 2 + r(-60, 60), cy: Math.min(e.y, y1) - r(90, 220), // the top of the throw
        born: now, fly: r(1100, 1500), fall: r(900, 1300),
        w, h: isNote ? w : ribbon ? w * 0.5 : w, round: !isNote && !ribbon && r(0, 1) < 0.5,
        color: colors[Math.floor(r(0, colors.length))],
        rot: r(0, 6.28), vr: isNote ? r(-3, 3) : r(-7, 7), flip: r(0, 6.28), vf: isNote ? r(6, 10) : r(5, 11), drift: r(-40, 40),
        note: isNote ? e.note ?? Math.floor(r(0, coins.length)) : -1,
      });
    };

    const frame = (now: number) => {
      // New throws, one or two a second per sprayer.
      const live = readRef.current();
      const ids = new Set(live.map((e) => e.id));
      for (const id of [...nextAt.keys()]) if (!ids.has(id)) nextAt.delete(id);
      for (const e of live) {
        const due = nextAt.get(e.id);
        if (e.perSecond <= 0) continue;
        if (due === undefined) nextAt.set(e.id, now + r(200, 600));
        else if (now >= due) {
          spawn(e, now);
          // At their own pace, a little uneven, like spraying by hand.
          nextAt.set(e.id, now + (1000 / e.perSecond) * r(0.85, 1.15));
        }
      }

      ctx.clearRect(0, 0, width, height);
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        const age = now - p.born;
        if (age > p.fly + p.fall) {
          pieces.splice(i, 1);
          continue;
        }
        let x: number;
        let y: number;
        let alpha = 1;
        if (age < p.fly) {
          const t = age / p.fly;
          const e = 1 - (1 - t) * (1 - t); // ease out
          x = (1 - e) * (1 - e) * p.x0 + 2 * (1 - e) * e * p.cx + e * e * p.x1;
          y = (1 - e) * (1 - e) * p.y0 + 2 * (1 - e) * e * p.cy + e * e * p.y1;
        } else {
          const t = (age - p.fly) / p.fall;
          x = p.x1 + p.drift * t;
          y = p.y1 + 140 * t * t;
          alpha = 1 - t;
        }
        const secs = age / 1000;
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot + p.vr * secs);
        ctx.scale(1, Math.cos(p.flip + p.vf * secs)); // looks like it spins as it flies
        ctx.fillStyle = p.color;
        if (p.note >= 0) ctx.drawImage(coins[p.note], -p.w / 2, -p.h / 2, p.w, p.h);
        else if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, 6.2832);
          ctx.fill();
        } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      if (pieces.length || live.length) raf = requestAnimationFrame(frame);
      else running = false; // nothing to draw: rest until someone sprays
    };

    kick.current = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    kick.current();
    return () => {
      cancelAnimationFrame(raf);
      running = false;
      kick.current = () => {};
    };
  }, [width, height, target.x[0], target.x[1], target.y[0], target.y[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wake the loop when someone new starts spraying.
  useEffect(() => {
    if (emitters?.length || active) kick.current();
  }, [emitters, active]);

  return <canvas ref={ref} className={`cf-canvas ${className}`} width={width} height={height} style={style} aria-hidden="true" />;
}
