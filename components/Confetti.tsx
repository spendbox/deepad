'use client';

import { useEffect, useMemo, useRef } from 'react';
import { confettiVolume } from '@/lib/confetti';
import './confetti.css';

export const CONFETTI_COLORS = ['var(--s-accent, #B3136F)', '#F4A6CB', '#E2A62B', '#F6D38A', '#5B1E6B', '#FFFFFF'];

/** A little random number generator that gives the same pieces for the same spray. */
function seeded(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return (a: number, b: number) => {
    s = (s * 16807) % 2147483647;
    return a + ((s - 1) / 2147483646) * (b - a);
  };
}

/**
 * One confetti burst: pieces fly up from `origin`, arc over and flutter down
 * across the landing area. Remounts (and replays) when `burstKey` changes.
 */
export function ConfettiBurst({
  burstKey,
  amountKobo,
  origin,
  landX,
  peakY,
  landY,
  size = 1,
  maxPieces = 200,
}: {
  burstKey: number;
  amountKobo: number;
  origin: { x: number; y: number };
  landX: [number, number];
  peakY: [number, number];
  landY: [number, number];
  size?: number;
  maxPieces?: number;
}) {
  const pieces = useMemo(() => {
    if (!burstKey) return [];
    const r = seeded(burstKey * 9973 + amountKobo);
    const { waves, perWave } = confettiVolume(amountKobo);
    const out: React.CSSProperties[] = [];
    for (let w = 0; w < waves; w++) {
      for (let i = 0; i < perWave && out.length < maxPieces; i++) {
        const ribbon = r(0, 1) < 0.6;
        const tx = r(landX[0], landX[1]);
        const rot1 = r(-360, 360);
        const flip1 = r(90, 360);
        const wPx = (ribbon ? r(22, 30) : r(10, 14)) * size;
        const hPx = (ribbon ? r(12, 16) : r(10, 14)) * size;
        out.push({
          width: wPx,
          height: hPx,
          left: origin.x,
          top: origin.y,
          borderRadius: !ribbon && r(0, 1) < 0.5 ? '50%' : '2px',
          background: CONFETTI_COLORS[Math.floor(r(0, CONFETTI_COLORS.length))],
          '--x1': `${(tx - origin.x) * r(0.42, 0.6)}px`,
          '--y1': `${r(peakY[0], peakY[1]) - origin.y}px`,
          '--x2': `${tx - origin.x + r(-40, 80) * size}px`,
          '--y2': `${r(landY[0], landY[1]) - origin.y}px`,
          '--r1': `${rot1}deg`,
          '--r2': `${rot1 + r(-540, 540)}deg`,
          '--f1': `${flip1}deg`,
          '--f2': `${flip1 + r(360, 900)}deg`,
          animationDelay: `${Math.round(w * 380 + r(0, 160))}ms`,
          animationDuration: `${r(2.1, 2.6).toFixed(2)}s`,
        } as React.CSSProperties);
      }
    }
    return out;
  }, [burstKey, amountKobo, origin.x, origin.y, landX, peakY, landY, size, maxPieces]);

  if (!pieces.length) return null;
  return (
    <div key={burstKey} className="cf-layer" aria-hidden="true">
      {pieces.map((style, i) => (
        <span key={i} className="cf-piece" style={style} />
      ))}
    </div>
  );
}

/**
 * Confetti raining over the whole screen (big spray takeover); more for
 * bigger sprays. Drawn on one canvas, which is far lighter for the browser
 * than animating a hundred separate elements, so the screen stays smooth.
 */
export function ConfettiRain({
  amountKobo,
  width,
  height,
  seed = 7,
  background,
}: {
  amountKobo: number;
  width: number;
  height: number;
  seed?: number;
  /** Paint the background too (a colour plus a soft glow): one solid layer is much cheaper than two. */
  background?: { color: string; glow: string; glowX: number; glowY: number; glowRadius: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { alpha: !background });
    if (!canvas || !ctx) return;
    const css = getComputedStyle(canvas);
    const resolve = (c: string) => (c.startsWith('var(') ? css.getPropertyValue(c.slice(4, -1).split(',')[0].trim()).trim() : c);
    const accent = css.getPropertyValue('--s-accent').trim() || '#B3136F';
    // The background, drawn into an offscreen canvas once, then copied each frame.
    let bg: HTMLCanvasElement | null = null;
    if (background) {
      bg = document.createElement('canvas');
      bg.width = width;
      bg.height = height;
      const b = bg.getContext('2d')!;
      b.fillStyle = resolve(background.color) || '#1F0A26';
      b.fillRect(0, 0, width, height);
      const g = b.createRadialGradient(background.glowX, background.glowY, 0, background.glowX, background.glowY, background.glowRadius);
      const glow = resolve(background.glow) || accent;
      g.addColorStop(0, glow);
      g.addColorStop(1, 'transparent');
      b.globalAlpha = 0.4;
      b.fillStyle = g;
      b.fillRect(0, 0, width, height);
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      if (bg) ctx.drawImage(bg, 0, 0);
      return;
    }
    const colors = CONFETTI_COLORS.map((c) => (c.startsWith('var(') ? accent : c));
    const r = seeded(seed);
    const { waves, perWave } = confettiVolume(amountKobo);
    const count = Math.round(Math.min(160, 50 + waves * perWave * 0.4));
    const pieces = Array.from({ length: count }, (_, i) => {
      const ribbon = r(0, 1) < 0.6;
      const w = ribbon ? r(22, 38) : r(12, 18);
      return {
        x: r(-40, width + 40),
        y: r(-height, height),
        w,
        h: ribbon ? w * 0.45 : w,
        round: !ribbon && r(0, 1) < 0.5,
        color: colors[i % colors.length],
        vy: r(220, 380), // px per second
        vx: r(-40, 40),
        sway: r(0, Math.PI * 2),
        rot: r(0, Math.PI * 2),
        vr: r(-4, 4),
        flip: r(0, Math.PI * 2),
        vf: r(3, 9),
      };
    });
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (bg) ctx.drawImage(bg, 0, 0);
      else ctx.clearRect(0, 0, width, height);
      for (const p of pieces) {
        p.y += p.vy * dt;
        p.sway += dt * 2;
        p.x += (p.vx + Math.sin(p.sway) * 30) * dt;
        p.rot += p.vr * dt;
        p.flip += p.vf * dt;
        if (p.y > height + 40) {
          p.y = -40;
          p.x = r(-40, width + 40);
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.flip)); // looks like it flips over as it falls
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountKobo, width, height, seed, JSON.stringify(background ?? null)]);

  return <canvas ref={ref} className="cf-rain" width={width} height={height} aria-hidden="true" />;
}
