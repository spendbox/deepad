'use client';

import { useEffect, useRef, useState } from 'react';
import { biggestNoteFor, NOTE_VALUES, type NoteValue } from '@/lib/wad';

// The guest's wad of notes on their phone. Swipe the top note up to throw it,
// tap for a quick flick, or hold to make it rain. Drawn on one canvas, so it
// stays smooth: the stack, the note under your thumb, and every note in the
// air (which flies up and away toward the stage, slowing, drifting, spinning
// and flipping over like real paper).

type NoteStyle = { base: string; light: string; dark: string; words: string };
const STYLE: Record<NoteValue, NoteStyle> = {
  100: { base: '#8C2F5C', light: '#E3A2C2', dark: '#5A1B3A', words: 'ONE HUNDRED NAIRA' },
  200: { base: '#2E7A5A', light: '#8FD1B0', dark: '#1B4E39', words: 'TWO HUNDRED NAIRA' },
  500: { base: '#2F5FA7', light: '#9BBDEB', dark: '#1C3D72', words: 'FIVE HUNDRED NAIRA' },
  1000: { base: '#6E4A2E', light: '#D2A676', dark: '#462C18', words: 'ONE THOUSAND NAIRA' },
};

/** A good note to start with: enough throws to enjoy, not so many that it takes all night. */
export function defaultNote(amountNaira: number): NoteValue {
  return amountNaira >= 20_000 ? 1000 : amountNaira >= 5_000 ? 500 : amountNaira >= 1_000 ? 200 : 100;
}

/** One note, drawn once at full sharpness and reused. */
function drawNote(value: NoteValue, w: number, h: number, dpr: number): HTMLCanvasElement {
  const s = STYLE[value];
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const r = h * 0.07;
  const shape = () => {
    g.beginPath();
    g.moveTo(r, 0);
    g.arcTo(w, 0, w, h, r);
    g.arcTo(w, h, 0, h, r);
    g.arcTo(0, h, 0, 0, r);
    g.arcTo(0, 0, w, 0, r);
    g.closePath();
  };
  // Paper
  const body = g.createLinearGradient(0, 0, w, h);
  body.addColorStop(0, s.light);
  body.addColorStop(0.45, s.base);
  body.addColorStop(1, s.dark);
  shape();
  g.fillStyle = body;
  g.fill();
  g.save();
  shape();
  g.clip();
  // Fine wavy lines across the note
  g.strokeStyle = 'rgba(255,255,255,0.13)';
  g.lineWidth = Math.max(0.6, h * 0.006);
  for (let i = 0; i < 16; i++) {
    g.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const y = (h / 16) * i + Math.sin(x / (w * 0.08) + i) * h * 0.035;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // A soft light patch (the watermark area)
  const wm = g.createRadialGradient(w * 0.24, h * 0.5, 0, w * 0.24, h * 0.5, h * 0.55);
  wm.addColorStop(0, 'rgba(255,255,255,0.35)');
  wm.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = wm;
  g.fillRect(0, 0, w, h);
  g.restore();
  // Inner border
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(1, h * 0.012);
  g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  // Portrait medallion
  g.beginPath();
  g.arc(w * 0.24, h * 0.5, h * 0.27, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fill();
  g.lineWidth = Math.max(1, h * 0.014);
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.stroke();
  g.beginPath();
  g.arc(w * 0.24, h * 0.44, h * 0.09, 0, Math.PI * 2);
  g.moveTo(w * 0.24 - h * 0.17, h * 0.72);
  g.quadraticCurveTo(w * 0.24, h * 0.5, w * 0.24 + h * 0.17, h * 0.72);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fill();
  // Value
  g.fillStyle = '#FFFFFF';
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = h * 0.03;
  g.font = `900 ${Math.round(h * 0.36)}px system-ui, sans-serif`;
  g.fillText(`₦${value.toLocaleString('en-NG')}`, w - h * 0.14, h * 0.6);
  g.shadowBlur = 0;
  g.font = `800 ${Math.round(h * 0.085)}px system-ui, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillText(s.words, w - h * 0.14, h * 0.8);
  g.textAlign = 'left';
  g.font = `900 ${Math.round(h * 0.12)}px system-ui, sans-serif`;
  g.fillText(String(value), h * 0.13, h * 0.24);
  return c;
}

/** The back of a note, seen while it flips over in the air: the same paper, no writing. */
function drawNoteBack(value: NoteValue, w: number, h: number, dpr: number): HTMLCanvasElement {
  const s = STYLE[value];
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const r = h * 0.07;
  g.beginPath();
  g.moveTo(r, 0);
  g.arcTo(w, 0, w, h, r);
  g.arcTo(w, h, 0, h, r);
  g.arcTo(0, h, 0, 0, r);
  g.arcTo(0, 0, w, 0, r);
  g.closePath();
  const body = g.createLinearGradient(w, 0, 0, h);
  body.addColorStop(0, s.base);
  body.addColorStop(1, s.dark);
  g.fillStyle = body;
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.1)';
  g.lineWidth = Math.max(0.6, h * 0.006);
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.ellipse(w / 2, h / 2, h * 0.08 * (i + 1), h * 0.05 * (i + 1), 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.4)';
  g.lineWidth = Math.max(1, h * 0.012);
  g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  return c;
}

type Flying = {
  x: number; y: number; vx: number; vy: number; z: number; vz: number;
  rot: number; vr: number; flip: number; vf: number; ph: number; ff: number; value: NoteValue; age: number;
};
type Sample = { t: number; x: number; y: number };

export default function Wad({
  amountNaira,
  leftNaira,
  onThrow,
  muted,
}: {
  amountNaira: number;
  /** What's left to spray (updates as notes are thrown). */
  leftNaira: number;
  /** A note was thrown. */
  onThrow: (value: NoteValue) => void;
  muted: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [note, setNote] = useState<NoteValue>(() => defaultNote(amountNaira));
  const leftRef = useRef(leftNaira);
  leftRef.current = leftNaira;
  const noteRef = useRef(note);
  noteRef.current = note;
  const throwRef = useRef(onThrow);
  throwRef.current = onThrow;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // What's left can no longer pay for the chosen note: step down to one that fits.
  useEffect(() => {
    const fit = biggestNoteFor(leftNaira, note);
    if (fit && fit !== note) setNote(fit);
  }, [leftNaira, note]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let noteW = 300;
    let noteH = 144;
    let sprites = new Map<NoteValue, HTMLCanvasElement>();
    let backs = new Map<NoteValue, HTMLCanvasElement>();

    const resize = () => {
      dpr = Math.min(2.5, window.devicePixelRatio || 1);
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      noteW = Math.min(W * 0.78, 360);
      noteH = noteW * 0.48;
      sprites = new Map(NOTE_VALUES.map((v) => [v, drawNote(v, noteW, noteH, dpr)]));
      backs = new Map(NOTE_VALUES.map((v) => [v, drawNoteBack(v, noteW, noteH, dpr)]));
    };
    resize();
    window.addEventListener('resize', resize);

    // Where the wad sits, and how thick it looks for what's left.
    const stackAt = () => ({ x: W / 2, y: H * 0.67 });
    const layersFor = () => {
      const left = leftRef.current;
      if (left < 100) return 0;
      return Math.max(1, Math.min(16, Math.round(3 + 13 * Math.sqrt(left / Math.max(1, amountNaira)))));
    };
    // A little fixed messiness in the stack, so it looks like a real wad.
    const jitter = Array.from({ length: 16 }, (_, i) => ({ dx: Math.sin(i * 12.9898) * 4, rot: Math.sin(i * 78.233) * 0.03 }));

    const flying: Flying[] = [];
    let drag: { id: number; sx: number; sy: number; dx: number; dy: number; start: number; samples: Sample[]; moved: boolean } | null = null;
    let back = { dx: 0, dy: 0, vx: 0, vy: 0 }; // the top note springing back into place
    let hold: ReturnType<typeof setTimeout> | undefined;
    let rain: ReturnType<typeof setInterval> | undefined;
    let raf = 0;
    let last = performance.now();

    // ----- Sound: a soft paper swish, made on the spot -----
    let audio: AudioContext | null = null;
    const swish = () => {
      if (mutedRef.current) return;
      try {
        audio ??= new AudioContext();
        if (audio.state === 'suspended') audio.resume().catch(() => {});
        const len = Math.floor(audio.sampleRate * 0.22);
        const buf = audio.createBuffer(1, len, audio.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len) ** 2;
        const src = audio.createBufferSource();
        src.buffer = buf;
        const bp = audio.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.9;
        const t0 = audio.currentTime;
        bp.frequency.setValueAtTime(1400 + Math.random() * 600, t0);
        bp.frequency.exponentialRampToValueAtTime(4200 + Math.random() * 1200, t0 + 0.2);
        const gain = audio.createGain();
        gain.gain.value = 0.32;
        src.connect(bp).connect(gain).connect(audio.destination);
        src.start();
      } catch {
        /* no sound on this phone */
      }
    };

    /** Throw the top note with this speed (px per second). */
    const launch = (x: number, y: number, vx: number, vy: number) => {
      const value = biggestNoteFor(leftRef.current, noteRef.current);
      if (!value) return false;
      leftRef.current -= value; // straight away, so a fast rain never overspends
      const speed = Math.hypot(vx, vy);
      flying.push({
        x, y, vx, vy,
        z: 0, vz: Math.min(2.4, 1 + speed / 900), // how fast it goes off toward the stage (a harder throw goes further)
        rot: 0, vr: vx * 0.004 + (Math.random() - 0.5) * 3,
        flip: 0, vf: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 7),
        ph: Math.random() * 6.28, ff: 5 + Math.random() * 4, value, age: 0,
      });
      if (flying.length > 70) flying.shift();
      throwRef.current(value);
      swish();
      navigator.vibrate?.(8);
      return true;
    };

    const topOfStack = () => {
      const { x, y } = stackAt();
      const n = layersFor();
      return { x, y: y - (n - 1) * 2.4 };
    };

    const quickFlick = (spread = 1) => {
      const top = topOfStack();
      launch(top.x + (Math.random() - 0.5) * 30 * spread, top.y, (Math.random() - 0.5) * 460 * spread, -(720 + Math.random() * 320));
    };

    // ----- Touch -----
    const onDown = (e: PointerEvent) => {
      if (leftRef.current < 100 || e.button > 0) return;
      canvas.setPointerCapture(e.pointerId);
      const t = performance.now();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, start: t, samples: [{ t, x: e.clientX, y: e.clientY }], moved: false };
      back = { dx: 0, dy: 0, vx: 0, vy: 0 };
      // Hold still to make it rain.
      hold = setTimeout(() => {
        if (!drag || drag.moved) return;
        quickFlick(1.4);
        rain = setInterval(() => (leftRef.current >= 100 ? quickFlick(1.4) : stopRain()), 130);
      }, 380);
    };
    const stopRain = () => {
      clearTimeout(hold);
      if (rain) clearInterval(rain);
      rain = undefined;
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const t = performance.now();
      drag.dx = e.clientX - drag.sx;
      drag.dy = e.clientY - drag.sy;
      if (Math.hypot(drag.dx, drag.dy) > 12) drag.moved = true;
      drag.samples.push({ t, x: e.clientX, y: e.clientY });
      while (drag.samples.length > 2 && t - drag.samples[0].t > 110) drag.samples.shift();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const raining = !!rain;
      stopRain();
      const d = drag;
      drag = null;
      if (raining) {
        back = { dx: d.dx, dy: d.dy, vx: 0, vy: 0 };
        return;
      }
      const first = d.samples[0];
      const lastS = d.samples[d.samples.length - 1];
      const dt = Math.max(0.016, (lastS.t - first.t) / 1000);
      const vx = (lastS.x - first.x) / dt;
      const vy = (lastS.y - first.y) / dt;
      const top = topOfStack();
      if (vy < -450 || d.dy < -noteH * 0.55) {
        // A swipe up: throw it, as hard as they swiped.
        launch(top.x + d.dx, top.y + d.dy, Math.max(-700, Math.min(700, vx * 0.45)), Math.min(-700, Math.max(-1250, vy * 0.45)));
      } else if (!d.moved && performance.now() - d.start < 320) {
        quickFlick(); // a tap
      } else {
        back = { dx: d.dx, dy: d.dy, vx: 0, vy: 0 }; // not far enough: back onto the wad
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    // ----- Drawing -----
    const drawSprite = (img: HTMLCanvasElement, x: number, y: number, rot: number, sx: number, sy: number, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(sx, sy);
      ctx.drawImage(img, -noteW / 2, -noteH / 2, noteW, noteH);
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const sprite = sprites.get(noteRef.current)!;
      const { x: sx, y: sy } = stackAt();
      const n = layersFor();

      // Shadow under the wad
      if (n) {
        const sh = ctx.createRadialGradient(sx, sy + noteH * 0.55, 0, sx, sy + noteH * 0.55, noteW * 0.6);
        sh.addColorStop(0, 'rgba(0,0,0,0.45)');
        sh.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sh;
        ctx.fillRect(sx - noteW, sy, noteW * 2, noteH * 1.2);
      }
      // The wad: layers from the bottom up, their edges showing
      for (let i = 0; i < n - 1; i++) {
        const j = jitter[i];
        ctx.save();
        ctx.translate(sx + j.dx, sy - i * 2.4);
        ctx.rotate(j.rot);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-noteW / 2, -noteH / 2 + 2, noteW, noteH);
        ctx.drawImage(sprite, -noteW / 2, -noteH / 2, noteW, noteH);
        ctx.restore();
      }
      // The top note: under the thumb, or springing back into place
      if (n) {
        let dx = 0;
        let dy = 0;
        if (drag && !rain) {
          dx = drag.dx;
          dy = Math.min(40, drag.dy);
        } else if (back.dx || back.dy) {
          // A soft spring back onto the wad
          back.vx += (-back.dx * 220 - back.vx * 22) * dt;
          back.vy += (-back.dy * 220 - back.vy * 22) * dt;
          back.dx += back.vx * dt;
          back.dy += back.vy * dt;
          if (Math.abs(back.dx) + Math.abs(back.dy) < 0.5 && Math.abs(back.vx) + Math.abs(back.vy) < 5) back = { dx: 0, dy: 0, vx: 0, vy: 0 };
          dx = back.dx;
          dy = back.dy;
        }
        const lift = drag && !rain ? 1.04 : 1;
        const top = topOfStack();
        drawSprite(sprite, top.x + dx, top.y + dy, jitter[n - 1].rot + dx * 0.0022, lift, lift);
      }

      // Notes in the air
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i];
        f.age += dt;
        if (!still) {
          // Paper in air: strong drag, a little gravity, a side-to-side flutter, spin and flip.
          f.vx += Math.cos(f.age * f.ff + f.ph) * 240 * dt;
          f.vy += 300 * dt;
          const dragK = Math.exp(-2.3 * dt);
          f.vx *= dragK;
          f.vy *= dragK;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.z += f.vz * dt; // off toward the stage
          f.vz *= Math.exp(-0.4 * dt);
          f.rot += f.vr * dt;
          f.vr *= Math.exp(-0.8 * dt);
          f.flip += f.vf * dt;
        } else {
          f.y -= 1400 * dt;
          f.z += 1.5 * dt;
        }
        const scale = 1 / (1 + 1.6 * f.z);
        const alpha = Math.max(0, Math.min(1, 1.9 - f.z * 0.85));
        if (alpha <= 0 || f.y < -noteH || f.age > 4) {
          flying.splice(i, 1);
          continue;
        }
        // Flipping over like paper: it squashes edge-on, then shows its back (never mirrored writing).
        const flipC = Math.cos(f.flip);
        const face = flipC >= 0 ? sprites.get(f.value)! : backs.get(f.value)!;
        drawSprite(face, f.x, f.y, f.rot, scale, scale * Math.max(0.06, Math.abs(flipC)), alpha);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      stopRain();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      audio?.close().catch(() => {});
    };
  }, [amountNaira]);

  return (
    <div className="wad" ref={wrapRef}>
      <canvas ref={canvasRef} className="wad-canvas" aria-label="Your wad of notes: swipe up to spray" role="img" />
      <div className="wad-notes" role="radiogroup" aria-label="Note to spray">
        {NOTE_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={note === v}
            className={`wad-note-btn n${v}`}
            disabled={leftNaira < v}
            onClick={() => setNote(v)}
          >
            ₦{v.toLocaleString('en-NG')}
          </button>
        ))}
      </div>
    </div>
  );
}
