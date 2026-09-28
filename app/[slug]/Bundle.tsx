'use client';

import { useEffect, useRef, useState } from 'react';
import { drawNaira } from '@/components/naira';
import { biggestNoteFor, NOTE_VALUES, type NoteValue } from '@/lib/wad';

// The guest's bundle of cash on their phone, standing upright near the bottom
// of the screen (the notes' long side along the phone's long side). It's as
// thick as the notes left: one note, or a tall stack of thousands (as much as
// fits). Swipe the top note up to throw it, tap for a quick flick, or hold to
// make it rain. Drawn on one canvas, so it stays smooth: the bundle, the note
// under your thumb, and every note in the air (which flies up and away toward
// the stage, slowing, drifting, spinning and flipping over like real paper).

/** A good note to start with: enough throws to enjoy, not so many that it takes all night. */
export function defaultNote(amountNaira: number): NoteValue {
  return amountNaira >= 20_000 ? 1000 : amountNaira >= 5_000 ? 500 : amountNaira >= 1_000 ? 200 : 100;
}

/** How thick each note looks in the bundle (px); the bundle stops growing once it fills its space. */
const PER_NOTE = 1.6;
const UPRIGHT = -Math.PI / 2;

type Flying = {
  x: number; y: number; vx: number; vy: number; z: number; vz: number;
  rot: number; vr: number; flip: number; vf: number; ph: number; ff: number; value: NoteValue; age: number;
};
type Sample = { t: number; x: number; y: number };

export default function Bundle({
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
  // Little pictures of each note for the note picker.
  const [thumbs, setThumbs] = useState<Partial<Record<NoteValue, string>>>({});
  useEffect(() => {
    setThumbs(Object.fromEntries(NOTE_VALUES.map((v) => [v, drawNaira(v, 120, 2).toDataURL()])));
  }, []);
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
    let long = 400; // the note's long side, standing upright
    let short = 206;
    let base = 0; // where the bottom of the bundle sits
    let maxThick = 120;
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
      const picker = 104; // the note picker along the bottom
      long = Math.round(Math.min(H * 0.52, (W * 0.58) / 0.515, 440));
      short = Math.round(long * 0.515);
      base = H - picker - 14;
      maxThick = Math.max(24, Math.min(170, base - long - H * 0.18));
      sprites = new Map(NOTE_VALUES.map((v) => [v, drawNaira(v, long, dpr, 'front')]));
      backs = new Map(NOTE_VALUES.map((v) => [v, drawNaira(v, long, dpr, 'back')]));
    };
    resize();
    window.addEventListener('resize', resize);

    /** How thick the bundle is for the notes left (0 when there's nothing left). */
    const thickness = () => {
      const value = biggestNoteFor(leftRef.current, noteRef.current);
      if (!value) return 0;
      const notes = Math.floor(leftRef.current / value);
      return Math.min(maxThick, Math.max(0, (notes - 1) * PER_NOTE));
    };
    /** Centre of the top note. */
    const topOfBundle = () => ({ x: W / 2, y: base - thickness() - long / 2 });

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
    const launch = (x: number, y: number, vx: number, vy: number, rot = 0) => {
      const value = biggestNoteFor(leftRef.current, noteRef.current);
      if (!value) return false;
      leftRef.current -= value; // straight away, so a fast rain never overspends
      const speed = Math.hypot(vx, vy);
      flying.push({
        x, y, vx, vy,
        z: 0, vz: Math.min(2.4, 1 + speed / 900), // how fast it goes off toward the stage (a harder throw goes further)
        rot: UPRIGHT + rot, vr: vx * 0.004 + (Math.random() - 0.5) * 3,
        flip: 0, vf: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 7),
        ph: Math.random() * 6.28, ff: 5 + Math.random() * 4, value, age: 0,
      });
      if (flying.length > 70) flying.shift();
      throwRef.current(value);
      swish();
      navigator.vibrate?.(8);
      return true;
    };

    const quickFlick = (spread = 1) => {
      const top = topOfBundle();
      launch(top.x + (Math.random() - 0.5) * 30 * spread, top.y, (Math.random() - 0.5) * 460 * spread, -(760 + Math.random() * 340));
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
      const top = topOfBundle();
      if (vy < -450 || d.dy < -long * 0.3) {
        // A swipe up: throw it, as hard as they swiped.
        launch(top.x + d.dx, top.y + Math.min(0, d.dy), Math.max(-700, Math.min(700, vx * 0.45)), Math.min(-760, Math.max(-1300, vy * 0.45)), d.dx * 0.0018);
      } else if (!d.moved && performance.now() - d.start < 320) {
        quickFlick(); // a tap
      } else {
        back = { dx: d.dx, dy: d.dy, vx: 0, vy: 0 }; // not far enough: back onto the bundle
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    // ----- Drawing -----
    /** A note: `rot` 0 is lying sideways, UPRIGHT is standing along the phone. */
    const drawSprite = (img: HTMLCanvasElement, x: number, y: number, rot: number, sx: number, sy: number, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(sx, sy);
      ctx.drawImage(img, -long / 2, -short / 2, long, short);
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const value = biggestNoteFor(leftRef.current, noteRef.current);
      const x = W / 2;
      const T = thickness();

      if (value) {
        const topY = base - T - long / 2;
        // Soft shadow the bundle casts on the floor
        const sh = ctx.createRadialGradient(x, base + 6, 0, x, base + 6, short * 0.9);
        sh.addColorStop(0, 'rgba(0,0,0,0.55)');
        sh.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sh;
        ctx.fillRect(x - short, base - 20, short * 2, 44);
        // The thickness of the bundle: the paper edges of every note underneath
        if (T > 0) {
          // (It runs from just under the top note, at base - T, down to the base.)
          const left = x - short / 2;
          const edge = ctx.createLinearGradient(left, 0, left + short, 0);
          edge.addColorStop(0, '#CFC3A8');
          edge.addColorStop(0.5, '#F1E8D4');
          edge.addColorStop(1, '#C8BB9E');
          ctx.fillStyle = edge;
          ctx.beginPath();
          ctx.roundRect(left, base - T - 6, short, T + 6, 4);
          ctx.fill();
          // One fine line per note (or per few notes when the bundle is at its tallest)
          ctx.strokeStyle = 'rgba(90,70,40,0.22)';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          for (let y = base - T + 1; y < base; y += PER_NOTE) {
            ctx.moveTo(left + 1, y);
            ctx.lineTo(left + short - 1, y);
          }
          ctx.stroke();
        }
        // The top note: under the thumb, or springing back into place
        let dx = 0;
        let dy = 0;
        if (drag && !rain) {
          dx = drag.dx;
          dy = Math.min(24, drag.dy);
        } else if (back.dx || back.dy) {
          back.vx += (-back.dx * 220 - back.vx * 22) * dt;
          back.vy += (-back.dy * 220 - back.vy * 22) * dt;
          back.dx += back.vx * dt;
          back.dy += back.vy * dt;
          if (Math.abs(back.dx) + Math.abs(back.dy) < 0.5 && Math.abs(back.vx) + Math.abs(back.vy) < 5) back = { dx: 0, dy: 0, vx: 0, vy: 0 };
          dx = back.dx;
          dy = back.dy;
        }
        const lifted = !!drag && !rain;
        // The next note peeks out while the top one is lifted
        if (lifted && T > 0) drawSprite(sprites.get(value)!, x, topY + PER_NOTE, UPRIGHT, 1, 1);
        if (lifted) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.45)';
          ctx.shadowBlur = 18;
          ctx.shadowOffsetY = 8;
        }
        drawSprite(sprites.get(value)!, x + dx, topY + dy, UPRIGHT + dx * 0.0018, lifted ? 1.03 : 1, lifted ? 1.03 : 1);
        if (lifted) ctx.restore();
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
        if (alpha <= 0 || f.y < -long || f.age > 4) {
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
    <div className="bundle" ref={wrapRef}>
      <canvas ref={canvasRef} className="bundle-canvas" aria-label="Your bundle of cash: swipe up to spray" role="img" />
      <div className="bundle-notes" role="radiogroup" aria-label="Note to spray">
        {NOTE_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={note === v}
            className="bundle-note-btn"
            disabled={leftNaira < v}
            onClick={() => setNote(v)}
            aria-label={`₦${v.toLocaleString('en-NG')} notes`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumbs[v] && <img src={thumbs[v]} alt="" className="bundle-note-img" />}
            <span>₦{v.toLocaleString('en-NG')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
