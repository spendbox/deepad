// The bank-alert "ding" the big screen plays for every spray. Made with the
// browser's own sound engine (Web Audio), so there's no sound file to load.
// Browsers only allow sound after someone clicks or taps the page once, so the
// screen calls unlockAlertSound() on the first click, tap or key press.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Call from a click, tap or key press: lets the browser play sound from now on. */
export function unlockAlertSound(): Promise<boolean> {
  const c = audio();
  if (!c) return Promise.resolve(false);
  if (c.state === 'running') return Promise.resolve(true);
  // While the browser still blocks sound, resume() just waits (it never fails), so give it a moment.
  const wait = new Promise<void>((r) => setTimeout(r, 400));
  return Promise.race([c.resume().catch(() => {}), wait]).then(() => c.state === 'running');
}

/** True while the browser still blocks sound (nobody has clicked the page yet). */
export function alertSoundBlocked(): boolean {
  const c = audio();
  return !!c && c.state !== 'running';
}

/** One bell-like note: a quick strike that rings out. */
function bell(c: AudioContext, out: AudioNode, freq: number, at: number, length: number, volume: number) {
  for (const [mult, share] of [[1, 1], [2.01, 0.35], [3.02, 0.12]] as const) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume * share, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length / mult);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
}

/** A short burst of noise: the "ka" of a cash register's "ka-ching". */
function clack(c: AudioContext, out: AudioNode, at: number, volume: number) {
  const len = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = c.createBufferSource();
  src.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const gain = c.createGain();
  gain.gain.value = volume;
  src.connect(hp).connect(gain).connect(out);
  src.start(at);
}

/** Play the alert: a bright two-note "ka-ching" for a spray, a fuller chime for a big spray. */
export function playAlert(big = false) {
  const c = audio();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.02;
  const out = c.createGain();
  out.gain.value = 0.5;
  out.connect(c.destination);
  clack(c, out, t, 0.5);
  if (big) {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(c, out, f, t + 0.05 + i * 0.11, 1.4, 0.3));
  } else {
    bell(c, out, 1318.5, t + 0.05, 0.9, 0.35);
    bell(c, out, 1760, t + 0.19, 1.2, 0.35);
  }
}
