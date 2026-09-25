'use client';

import { useEffect, useRef } from 'react';
import './confetti.css';

// All confetti is drawn on a <canvas>: one layer the browser can paint
// cheaply, instead of hundreds of moving page elements. That keeps the big
// screen smooth even with many people spraying at once.

export const CONFETTI_COLORS = ['var(--s-accent)', '#F4A6CB', '#E2A62B', '#F6D38A', '#5B1E6B', '#FFFFFF', '#1F7A5C'];

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
};

export type Emitter = { id: number; x: number; y: number; perSecond: number };

/**
 * People spraying: every emitter (a sprayer's name on screen) throws a piece
 * of confetti about once a second (now and then twice), arcing onto the celebrant's
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
    const pieces: Piece[] = [];
    const nextAt = new Map<number, number>();
    let raf = 0;
    let running = false;

    const spawn = (e: Emitter, now: number) => {
      const ribbon = r(0, 1) < 0.65;
      const w = ribbon ? r(20, 30) : r(11, 15);
      const x1 = r(target.x[0], target.x[1]);
      const y1 = r(target.y[0], target.y[1]);
      pieces.push({
        x0: e.x, y0: e.y, x1, y1,
        cx: (e.x + x1) / 2 + r(-60, 60), cy: Math.min(e.y, y1) - r(90, 220), // the top of the throw
        born: now, fly: r(1100, 1500), fall: r(900, 1300),
        w, h: ribbon ? w * 0.5 : w, round: !ribbon && r(0, 1) < 0.5,
        color: colors[Math.floor(r(0, colors.length))],
        rot: r(0, 6.28), vr: r(-7, 7), flip: r(0, 6.28), vf: r(5, 11), drift: r(-40, 40),
      });
    };

    const frame = (now: number) => {
      // New throws, one or two a second per sprayer.
      const live = readRef.current();
      const ids = new Set(live.map((e) => e.id));
      for (const id of [...nextAt.keys()]) if (!ids.has(id)) nextAt.delete(id);
      for (const e of live) {
        const due = nextAt.get(e.id);
        if (due === undefined) nextAt.set(e.id, now + r(0, 300));
        else if (now >= due) {
          spawn(e, now);
          // Usually one piece a second, now and then two.
          nextAt.set(e.id, now + (1000 / e.perSecond) * (r(0, 1) < 0.25 ? 0.5 : 1) * r(0.85, 1.15));
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
        ctx.scale(1, Math.cos(p.flip + p.vf * secs)); // looks like it flips as it flies
        ctx.fillStyle = p.color;
        if (p.round) {
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
