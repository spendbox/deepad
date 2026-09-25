'use client';

import { useEffect, useRef } from 'react';
import { CONFETTI_COLORS } from './Confetti';

// Confetti and naira notes raining down over the whole screen while people are
// spraying. The amount of rain is the same however many people spray (it
// never gets heavier or slower with a crowd); each new spray keeps it going a
// little longer. Drawn on one <canvas>, with the notes drawn once up front and
// reused, so it stays smooth.

type Drop = {
  x: number; y: number; vy: number; sway: number; swayF: number; phase: number;
  rot: number; vr: number; flip: number; vf: number;
  note: number; // -1 for confetti, else which note picture
  w: number; h: number; color: string; round: boolean;
};

const NOTES = [
  { base: '#6E4A2E', light: '#B98A5E', label: '1000' }, // brown, like the ₦1000
  { base: '#2F5FA7', light: '#7FA6DE', label: '500' }, // blue, like the ₦500
  { base: '#2E7A5A', light: '#79C19F', label: '200' }, // green
];

/** A naira note, drawn once at twice its size so it stays sharp. */
function noteSprite(n: (typeof NOTES)[number]): HTMLCanvasElement {
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

function reducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Rains while `until` (a time in ms) is in the future. `perSecond` pieces a
 * second, of which `money` (0 to 1) are notes. Sizes are in the canvas's pixels.
 */
export default function Rain({
  until,
  width,
  height,
  perSecond = 22,
  money = 0.3,
  style,
}: {
  until: number;
  width: number;
  height: number;
  perSecond?: number;
  money?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const untilRef = useRef(until);
  untilRef.current = until;
  const moneyRef = useRef(money);
  moneyRef.current = money;
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || reducedMotion()) return;
    const accent = getComputedStyle(canvas).getPropertyValue('--s-accent').trim() || '#B3136F';
    const colors = CONFETTI_COLORS.map((c) => (c.startsWith('var(') ? accent : c));
    const notes = NOTES.map(noteSprite);
    const k = height / 1080; // falls at the same pace on any screen
    const drops: Drop[] = [];
    let raf = 0;
    let running = false;
    let last = 0;
    let owed = 0;

    const add = () => {
      const isNote = Math.random() < moneyRef.current;
      const ribbon = Math.random() < 0.6;
      const w = isNote ? 88 * (0.75 + Math.random() * 0.35) : ribbon ? 16 + Math.random() * 10 : 10 + Math.random() * 5;
      drops.push({
        x: Math.random() * width,
        y: -60,
        vy: (isNote ? 150 + Math.random() * 90 : 190 + Math.random() * 140) * k,
        sway: (isNote ? 50 : 30) * (0.5 + Math.random()),
        swayF: 0.6 + Math.random() * 0.9,
        phase: Math.random() * 6.28,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * (isNote ? 2.5 : 8),
        flip: Math.random() * 6.28,
        vf: isNote ? 2 + Math.random() * 2.5 : 5 + Math.random() * 6,
        note: isNote ? Math.floor(Math.random() * notes.length) : -1,
        w,
        h: isNote ? w / 2 : ribbon ? w * 0.45 : w,
        color: colors[Math.floor(Math.random() * colors.length)],
        round: !isNote && !ribbon && Math.random() < 0.5,
      });
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      if (Date.now() < untilRef.current) {
        owed += perSecond * (width / 1920) * dt;
        while (owed >= 1) {
          add();
          owed -= 1;
        }
      }
      ctx.clearRect(0, 0, width, height);
      const t = now / 1000;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.y += d.vy * dt;
        if (d.y > height + 80) {
          drops.splice(i, 1);
          continue;
        }
        const x = d.x + Math.sin(d.phase + t * d.swayF * 6.28) * d.sway;
        ctx.save();
        ctx.translate(x, d.y);
        ctx.rotate(d.rot + d.vr * t);
        ctx.scale(1, Math.cos(d.flip + d.vf * t)); // looks like it flips as it falls
        if (d.note >= 0) ctx.drawImage(notes[d.note], -d.w / 2, -d.h / 2, d.w, d.h);
        else {
          ctx.fillStyle = d.color;
          if (d.round) {
            ctx.beginPath();
            ctx.arc(0, 0, d.w / 2, 0, 6.2832);
            ctx.fill();
          } else ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
        }
        ctx.restore();
      }
      if (drops.length || Date.now() < untilRef.current) raf = requestAnimationFrame(frame);
      else {
        running = false; // nothing falling: rest until the next spray
        last = 0;
      }
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
  }, [width, height, perSecond]);

  useEffect(() => {
    if (until > Date.now()) kick.current();
  }, [until]);

  return <canvas ref={ref} className="cf-canvas" width={width} height={height} style={style} aria-hidden="true" />;
}
