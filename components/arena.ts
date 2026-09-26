// A tiny physics "arena" for the big screen. Name tags and lines are boxes
// that drift slowly, bounce off each other, the screen edges and the
// celebrant, so nothing ever overlaps. Positions are written straight to
// each element's transform every frame (no React re-render), which keeps the
// screen smooth even with many people spraying.

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type BodyKind = 'sprayer' | 'line';
export type BodyOptions = { kind: BodyKind; big?: boolean; perSecond?: number };

type Body = {
  id: string;
  el: HTMLElement;
  kind: BodyKind;
  big: boolean;
  perSecond: number;
  x: number; // centre
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  mass: number;
  leaving: boolean;
};

const GAP = 18; // breathing room kept between any two things on screen
const MIN_SPEED = 14; // px per second: always gently moving
const MAX_SPEED = 42;

export class Arena {
  private bodies = new Map<string, Body>();
  /** Since when each box has been stuck touching something it can't bounce away from. */
  private stuckSince = new Map<string, number>();
  private raf = 0;
  private last = 0;
  private seed = 1;
  // Keeps each box's size right if its text or photo finishes loading later.
  private sizer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          for (const e of entries) {
            const b = this.bodyOf.get(e.target);
            if (b) { b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; }
          }
        });
  private bodyOf = new WeakMap<Element, Body>();

  constructor(
    private bounds: Rect,
    private obstacles: Rect[],
  ) {}

  /** The screen changed shape: new play area (everything settles into it on the next frame). */
  setBounds(bounds: Rect, obstacles: Rect[]) {
    this.bounds = bounds;
    this.obstacles = obstacles;
  }

  private rand(a: number, b: number) {
    this.seed = (this.seed * 16807) % 2147483647;
    return a + ((this.seed - 1) / 2147483646) * (b - a);
  }

  /** How much a box here would overlap everything else (0 = a free spot). */
  private crowding(x: number, y: number, w: number, h: number, skip?: string) {
    const area = (r: Rect) =>
      Math.max(0, Math.min(x + w / 2 + GAP, r.x1) - Math.max(x - w / 2 - GAP, r.x0)) *
      Math.max(0, Math.min(y + h / 2 + GAP, r.y1) - Math.max(y - h / 2 - GAP, r.y0));
    let total = 0;
    for (const r of this.obstacles) total += area(r);
    for (const b of this.bodies.values()) {
      if (b.id === skip || b.leaving) continue;
      total += area({ x0: b.x - b.w / 2, y0: b.y - b.h / 2, x1: b.x + b.w / 2, y1: b.y + b.h / 2 });
    }
    return total;
  }

  /** The freest spot for a box this size: the first free one found, or the least crowded of many tries. */
  private freeSpot(w: number, h: number, skip?: string) {
    const { x0, y0, x1, y1 } = this.bounds;
    let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, c: Infinity };
    for (let i = 0; i < 300; i++) {
      const x = this.rand(x0 + w / 2, Math.max(x0 + w / 2, x1 - w / 2));
      const y = this.rand(y0 + h / 2, Math.max(y0 + h / 2, y1 - h / 2));
      const c = this.crowding(x, y, w, h, skip);
      if (c < best.c) best = { x, y, c };
      if (c === 0) break;
    }
    return best;
  }

  /** Put a new element on screen, in a free spot if there is one. */
  add(id: string, el: HTMLElement, opts: BodyOptions) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    this.seed = (this.seed + id.length * 7919 + Date.now()) % 2147483646 || 1;
    const { x, y } = this.freeSpot(w, h);
    const angle = this.rand(0, Math.PI * 2);
    const speed = this.rand(MIN_SPEED, MAX_SPEED * 0.7) * (opts.big ? 0.6 : 1);
    this.bodies.set(id, {
      id, el, kind: opts.kind, big: !!opts.big, perSecond: opts.perSecond ?? 1,
      x, y, w, h, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      mass: opts.big ? 4 : opts.kind === 'line' ? 2 : 1, leaving: false,
    });
    const body = this.bodies.get(id)!;
    this.bodyOf.set(el, body);
    this.sizer?.observe(el);
    this.place(body);
    this.start();
  }

  /** Is there a free spot for a box this size right now? (e.g. wait with a new line until there is) */
  roomFor(w: number, h: number) {
    return this.freeSpot(w, h).c === 0;
  }

  remove(id: string) {
    this.stuckSince.delete(id);
    const b = this.bodies.get(id);
    if (b) this.sizer?.unobserve(b.el);
    this.bodies.delete(id);
  }

  /** A leaving element stops pushing others around while it fades out. */
  setLeaving(id: string, leaving: boolean) {
    const b = this.bodies.get(id);
    if (b) b.leaving = leaving;
  }

  /** Where the sprayers are right now, for the confetti. */
  emitters() {
    const out: { id: number; x: number; y: number; perSecond: number }[] = [];
    for (const b of this.bodies.values()) {
      if (b.kind === 'sprayer' && !b.leaving) out.push({ id: hash(b.id), x: b.x, y: b.y, perSecond: b.perSecond });
    }
    return out;
  }

  private place(b: Body) {
    b.el.style.transform = `translate3d(${(b.x - b.w / 2).toFixed(1)}px, ${(b.y - b.h / 2).toFixed(1)}px, 0)`;
  }

  private step(dt: number) {
    const list = [...this.bodies.values()];

    for (const b of list) {
      // Wander a little, but keep a gentle, steady pace.
      b.vx += this.rand(-18, 18) * dt;
      b.vy += this.rand(-18, 18) * dt;
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const cap = b.big ? MAX_SPEED * 0.6 : MAX_SPEED;
      const floor = b.big ? MIN_SPEED * 0.6 : MIN_SPEED;
      const k = speed > cap ? cap / speed : speed < floor ? floor / speed : 1;
      b.vx *= k;
      b.vy *= k;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    // Settle: a few passes of edges → celebrant → each other, so one push can
    // never shove something into a wall, the celebrant or a neighbour.
    for (let pass = 0; pass < 10; pass++) {
      for (const b of list) {
        this.clampToWalls(b);
        for (const r of this.obstacles) this.pushOutOf(b, r);
      }
      if (!this.separate(list)) break;
    }
    for (const b of list) {
      this.clampToWalls(b);
      for (const r of this.obstacles) this.pushOutOf(b, r);
    }
    this.unjam(list);
    for (const b of list) this.place(b);
  }

  /**
   * On a very busy screen a box can get pinned (between the celebrant, an edge
   * and a neighbour) where bouncing can't free it. If one stays stuck touching
   * something for a moment, it hops to the freest spot with a little pop.
   */
  private unjam(list: Body[]) {
    const now = performance.now();
    const stuck = new Set<Body>();
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.leaving) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.leaving) continue;
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 2) {
          stuck.add(a.mass <= b.mass ? a : b); // the lighter one moves
        }
      }
    }
    for (const b of list) {
      if (!stuck.has(b)) {
        this.stuckSince.delete(b.id);
        continue;
      }
      const since = this.stuckSince.get(b.id) ?? now;
      this.stuckSince.set(b.id, since);
      if (now - since < 400) continue;
      const spot = this.freeSpot(b.w, b.h, b.id);
      b.x = spot.x;
      b.y = spot.y;
      this.stuckSince.delete(b.id);
      (b.el.firstElementChild as HTMLElement | null)?.animate?.(
        [{ transform: 'scale(.6)', opacity: 0.2 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 380, easing: 'cubic-bezier(.34, 1.56, .64, 1)' },
      );
    }
  }

  private clampToWalls(b: Body) {
    const { x0, y0, x1, y1 } = this.bounds;
    if (b.x - b.w / 2 < x0) { b.x = x0 + b.w / 2; b.vx = Math.abs(b.vx); }
    if (b.x + b.w / 2 > x1) { b.x = x1 - b.w / 2; b.vx = -Math.abs(b.vx); }
    if (b.y - b.h / 2 < y0) { b.y = y0 + b.h / 2; b.vy = Math.abs(b.vy); }
    if (b.y + b.h / 2 > y1) { b.y = y1 - b.h / 2; b.vy = -Math.abs(b.vy); }
  }

  /** Move a box out of an obstacle by the shortest way that stays on screen. */
  private pushOutOf(b: Body, r: Rect) {
    const { x0, y0, x1, y1 } = this.bounds;
    const hw = b.w / 2 + GAP;
    const hh = b.h / 2 + GAP;
    if (b.x - hw >= r.x1 || b.x + hw <= r.x0 || b.y - hh >= r.y1 || b.y + hh <= r.y0) return;
    const options: { d: number; apply: () => void }[] = [];
    const left = r.x0 - hw;
    const right = r.x1 + hw;
    const up = r.y0 - hh;
    const down = r.y1 + hh;
    if (left - b.w / 2 >= x0) options.push({ d: b.x - left, apply: () => { b.x = left; b.vx = -Math.abs(b.vx); } });
    if (right + b.w / 2 <= x1) options.push({ d: right - b.x, apply: () => { b.x = right; b.vx = Math.abs(b.vx); } });
    if (up - b.h / 2 >= y0) options.push({ d: b.y - up, apply: () => { b.y = up; b.vy = -Math.abs(b.vy); } });
    if (down + b.h / 2 <= y1) options.push({ d: down - b.y, apply: () => { b.y = down; b.vy = Math.abs(b.vy); } });
    options.sort((p, q) => p.d - q.d);
    options[0]?.apply();
  }

  /** Bounce off each other: push apart along the smaller overlap and swap that part of their speed. */
  private separate(list: Body[]) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.leaving) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.leaving) continue;
        const ox = (a.w + b.w) / 2 + GAP - Math.abs(a.x - b.x);
        const oy = (a.h + b.h) / 2 + GAP - Math.abs(a.y - b.y);
        if (ox <= 0.5 || oy <= 0.5) continue;
        moved = true;
        const total = a.mass + b.mass;
        if (ox < oy) {
          const dir = a.x < b.x ? -1 : 1;
          a.x += dir * ox * (b.mass / total);
          b.x -= dir * ox * (a.mass / total);
          if ((a.vx - b.vx) * dir < 0) [a.vx, b.vx] = [b.vx, a.vx];
        } else {
          const dir = a.y < b.y ? -1 : 1;
          a.y += dir * oy * (b.mass / total);
          b.y -= dir * oy * (a.mass / total);
          if ((a.vy - b.vy) * dir < 0) [a.vy, b.vy] = [b.vy, a.vy];
        }
      }
    }
    return moved;
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      // Nothing on screen: rest until something arrives.
      this.raf = this.bodies.size ? requestAnimationFrame(frame) : 0;
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
