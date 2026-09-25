// Keeps the live camera picture upright on the big screen, however the phone is
// held (browser only).
//
// Phones only turn the camera picture when the screen itself turns. With the
// phone's rotation lock on, holding it sideways sends a sideways picture. We
// read which way is really "up" from the phone's motion sensor, and when the
// picture doesn't match, redraw each frame turned the right way before sending.

/** Clockwise turn (0, 90, 180 or 270) that makes a picture from this screen orientation upright. */
export function correction(physical: number, screenAngle: number): number {
  return (((screenAngle - physical) % 360) + 360) % 360;
}

/** How the screen is turned right now (0, 90, 180, 270), as the phone reports it. */
export function screenAngle(): number {
  const o = typeof screen !== 'undefined' ? screen.orientation : undefined;
  if (o && typeof o.angle === 'number') return ((o.angle % 360) + 360) % 360;
  const legacy = (window as Window & { orientation?: number }).orientation;
  return typeof legacy === 'number' ? ((legacy % 360) + 360) % 360 : 0;
}

const IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

/**
 * Watches which way the phone is physically held: 0 upright, 90 turned to the
 * left (top pointing left), 180 upside down, 270 turned to the right. Ignores
 * the phone lying flat and quick wobbles. Returns a stop function.
 */
export function watchHold(onChange: (angle: number) => void): () => void {
  let current = -1;
  let candidate = -1;
  let since = 0;
  const onMotion = (ev: DeviceMotionEvent) => {
    const g = ev.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null) return;
    // iPhones report these the other way round from Android.
    const x = IOS ? -g.x : g.x;
    const y = IOS ? -g.y : g.y;
    if (Math.max(Math.abs(x), Math.abs(y)) < 6) return; // lying flat: keep what we had
    const angle = Math.abs(y) >= Math.abs(x) ? (y > 0 ? 0 : 180) : x > 0 ? 90 : 270;
    const now = Date.now();
    if (angle !== candidate) {
      candidate = angle;
      since = now;
    }
    if (angle !== current && now - since > 500) {
      current = angle;
      onChange(angle);
    }
  };
  window.addEventListener('devicemotion', onMotion);
  return () => window.removeEventListener('devicemotion', onMotion);
}

/** iPhones ask permission for the motion sensor; must be called from a tap. */
export async function askMotionPermission(): Promise<void> {
  const D = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as
    | (typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> })
    | undefined;
  try {
    if (D?.requestPermission) await D.requestPermission();
  } catch {}
}

/**
 * Redraws a camera picture turned by `turn` degrees clockwise, as a new video
 * track to send. Only used while a turn is needed (a straight picture is sent as it is).
 */
export class FrameRotator {
  private video = document.createElement('video');
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d');
  private out: MediaStreamTrack | null = null;
  private turn = 0;
  private timer = 0;

  constructor() {
    this.video.muted = true;
    this.video.playsInline = true;
  }

  setSource(stream: MediaStream) {
    this.video.srcObject = stream;
    this.video.play().catch(() => {});
  }

  setTurn(turn: number) {
    this.turn = turn;
  }

  /** The turned picture as a video track (made on first use). */
  track(): MediaStreamTrack {
    if (!this.out) {
      this.out = this.canvas.captureStream(30).getVideoTracks()[0];
      // A timer, not animation frames: keeps drawing even if the browser throttles animations.
      this.timer = window.setInterval(() => this.draw(), 1000 / 30);
    }
    return this.out;
  }

  private draw() {
    const v = this.video;
    const ctx = this.ctx;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!ctx || !w || !h) return;
    const side = this.turn % 180 !== 0;
    const cw = side ? h : w;
    const ch = side ? w : h;
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((this.turn * Math.PI) / 180);
    ctx.drawImage(v, -w / 2, -h / 2, w, h);
  }

  stop() {
    clearInterval(this.timer);
    this.out?.stop();
    this.out = null;
    this.video.srcObject = null;
  }
}
