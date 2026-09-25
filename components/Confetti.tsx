'use client';

import { useMemo } from 'react';
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
  maxPieces = 260,
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

/** Confetti raining over the whole screen (big spray takeover); more for bigger sprays. */
export function ConfettiRain({ amountKobo, width, height, seed = 7 }: { amountKobo: number; width: number; height: number; seed?: number }) {
  const pieces = useMemo(() => {
    const r = seeded(seed);
    const { waves, perWave } = confettiVolume(amountKobo);
    const count = Math.min(170, 40 + waves * perWave * 0.5);
    const out: { style: React.CSSProperties; front: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const front = i < 6;
      const ribbon = r(0, 1) < 0.6;
      const w = front ? r(60, 90) : ribbon ? r(24, 40) : r(12, 20);
      const dur = front ? r(4.8, 6.8) : r(3.2, 5.6);
      out.push({
        front,
        style: {
          left: Math.round(r(-60, width)),
          width: w,
          height: ribbon || front ? w * 0.45 : w,
          borderRadius: !ribbon && !front && r(0, 1) < 0.5 ? '50%' : '3px',
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          animationName: `cfFall${['A', 'B', 'C'][i % 3]}`,
          animationDuration: `${dur.toFixed(2)}s`,
          animationDelay: `-${r(0, dur).toFixed(2)}s`,
          '--fall': `${height + 260}px`,
        } as React.CSSProperties,
      });
    }
    return out;
  }, [amountKobo, width, height, seed]);

  return (
    <>
      <div className="cf-rain" aria-hidden="true">
        {pieces.filter((p) => !p.front).map((p, i) => <span key={i} className="cf-drop" style={p.style} />)}
      </div>
      <div className="cf-rain front" aria-hidden="true">
        {pieces.filter((p) => p.front).map((p, i) => <span key={i} className="cf-drop blur" style={p.style} />)}
      </div>
    </>
  );
}
