'use client';

import { useEffect, useRef } from 'react';
import './confetti.css';

// All confetti is drawn on a <canvas>: one layer the browser can paint
// cheaply, instead of hundreds of moving page elements. That keeps the big
// screen smooth even with many people spraying at once.

export const CONFETTI_COLORS = ['var(--s-accent)', '#F4A6CB', '#E2A62B', '#F6D38A', '#5B1E6B', '#FFFFFF', '#1F7A5C'];

export const NOTES = [
  { base: '#6E4A2E', light: '#B98A5E', label: '1000' }, // brown, like the ₦1000
  { base: '#2F5FA7', light: '#7FA6DE', label: '500' }, // blue, like the ₦500
  { base: '#2E7A5A', light: '#79C19F', label: '200' }, // green
  { base: '#8C2F5C', light: '#D98AB0', label: '100' }, // red-violet, like the ₦100
];
/** The ₦100 note: what each sprayer throws (one note per ₦100 they sent). */
export const NOTE_100 = 3;

/** A naira note, drawn once at twice its size so it stays sharp. */
export function noteSprite(n: (typeof NOTES)[number]): HTMLCanvasElement {
  const W = 88;
  const H = 44;
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  g.fillStyle = n.base;
  g.beginPath();
  g.roundRect(0, 0, W, H, 4);
  g.fill();
  g.strokeStyle = n.light;
  g.lineWidth = 2;
  g.strokeRect(4, 4, W - 8, H - 8);
  g.fillStyle = n.light;
  g.beginPath();
  g.arc(22, H / 2, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#FFFFFF';
  g.font = '800 17px system-ui, sans-serif';
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.fillText(`₦${n.label}`, W - 9, H / 2 + 1);
  return c;
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
  note: number; // -1 for confetti, else which naira note picture
};

/** Someone spraying. `money` (0 to 1): how many of their throws are naira notes rather than confetti. */
export type Emitter = { id: number; x: number; y: number; perSecond: number; money?: number; note?: number };

/**
 * People spraying: every emitter (a sprayer's name on screen) throws naira
 * notes and confetti at its own pace (the person in the spotlight throws a
 * fast stream of notes, like spraying a wad by hand), arcing onto the celebrant's
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
  onThrow,
}: {
  /** Called as each sprayer throws (e.g. to flick their hand). */
  onThrow?: (id: number) => void;
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
  const throwRef = useRef(onThrow);
  throwRef.current = onThrow;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || reducedMotion()) return;
    const colors = resolveColors(canvas);
    const r = seeded(Date.now());
    const notes = NOTES.map(noteSprite);
    const pieces: Piece[] = [];
    const nextAt = new Map<number, number>();
    let raf = 0;
    let running = false;

    const spawn = (e: Emitter, now: number) => {
      const isNote = r(0, 1) < (e.money ?? 0);
      const ribbon = r(0, 1) < 0.65;
      const w = isNote ? r(66, 92) : ribbon ? r(20, 30) : r(11, 15);
      const x1 = r(target.x[0], target.x[1]);
      const y1 = r(target.y[0], target.y[1]);
      pieces.push({
        x0: e.x, y0: e.y, x1, y1,
        cx: (e.x + x1) / 2 + r(-60, 60), cy: Math.min(e.y, y1) - r(90, 220), // the top of the throw
        born: now, fly: r(1100, 1500), fall: r(900, 1300),
        w, h: isNote ? w / 2 : ribbon ? w * 0.5 : w, round: !isNote && !ribbon && r(0, 1) < 0.5,
        color: colors[Math.floor(r(0, colors.length))],
        rot: r(0, 6.28), vr: isNote ? r(-3, 3) : r(-7, 7), flip: r(0, 6.28), vf: isNote ? r(2, 4) : r(5, 11), drift: r(-40, 40),
        note: isNote ? e.note ?? Math.floor(r(0, notes.length)) : -1,
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
          throwRef.current?.(e.id);
          // At their own pace, a little uneven like a real hand.
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
        ctx.scale(1, Math.cos(p.flip + p.vf * secs)); // looks like it flips as it flies
        ctx.fillStyle = p.color;
        if (p.note >= 0) ctx.drawImage(notes[p.note], -p.w / 2, -p.h / 2, p.w, p.h);
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
