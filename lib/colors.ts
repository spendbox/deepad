// Colour maths for custom event themes. Whatever two colours a planner picks,
// the big screen must stay readable from the back of the hall, so every text
// colour is checked against WCAG contrast ratios and nudged until it passes.

export type RGB = [number, number, number];

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Blend: 0 = all `a`, 1 = all `b`. */
export function mix(a: string, b: string, amount: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * amount) as RGB);
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** The same colour, lighter or darker (lightness 0 to 1), keeping its hue. */
export function withLightness(hex: string, l: number): string {
  const [h, s] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, s, Math.min(1, Math.max(0, l))]));
}

function lightnessOf(hex: string): number {
  return rgbToHsl(hexToRgb(hex))[2];
}

/**
 * Move `color` lighter or darker (keeping its hue) until it reaches `ratio`
 * against every colour in `against`. Tries the direction that needs the
 * smaller change first. Returns the colour unchanged if it already passes.
 */
export function ensureContrast(color: string, against: string[], ratio: number): string {
  const ok = (c: string) => against.every((b) => contrast(c, b) >= ratio);
  if (ok(color)) return color;
  const start = lightnessOf(color);
  const tries: string[] = [];
  for (const dir of [1, -1]) {
    for (let step = 1; step <= 100; step++) {
      const l = start + dir * step * 0.01;
      if (l < 0 || l > 1) break;
      const c = withLightness(color, l);
      if (ok(c)) {
        tries.push(c);
        break;
      }
    }
  }
  if (tries.length) {
    return tries.sort((a, b) => Math.abs(lightnessOf(a) - start) - Math.abs(lightnessOf(b) - start))[0];
  }
  // Nothing with this hue works: plain black or white always does better.
  return ['#FFFFFF', '#000000'].sort((a, b) => Math.min(...against.map((x) => contrast(b, x))) - Math.min(...against.map((x) => contrast(a, x))))[0];
}

/** Whichever of black-ish or white-ish reads best on `bg`, lightly tinted with `tint`. */
export function readableOn(bg: string, tint: string = bg, ratio = 7): string {
  const light = mix('#FFFFFF', tint, 0.06);
  const dark = mix('#000000', tint, 0.12);
  const pick = contrast(light, bg) >= contrast(dark, bg) ? light : dark;
  if (contrast(pick, bg) >= ratio) return pick;
  return contrast('#FFFFFF', bg) >= contrast('#000000', bg) ? '#FFFFFF' : '#000000';
}

export type ScreenColors = {
  bg: string;
  panel: string;
  accent: string;
  onAccent: string;
  text: string;
  muted: string;
  /** True for bright backgrounds (dark text). */
  light: boolean;
  /** What we had to change to keep things readable, in plain words. */
  notes: string[];
};

/** Minimums used for the big screen. */
// Text on the highlight colour is always huge (the account number), where 4.5:1 is plenty.
export const CONTRAST = { text: 7, muted: 4.5, accent: 4.5, onAccent: 4.5 };

/**
 * Build a full, readable big-screen palette from the planner's two colours:
 * primary = the background, secondary = the highlight (amounts, account bar).
 */
export function paletteFromColors(primary: string, secondary: string): ScreenColors {
  const notes: string[] = [];

  // 1. Background: must allow very readable text. Mid-tones get nudged darker
  //    or lighter, whichever needs the smaller change.
  const original = primary.toUpperCase();
  let bg = original;
  const best = (c: string) => Math.max(contrast('#FFFFFF', c), contrast('#000000', c));
  if (best(bg) < CONTRAST.text) {
    const start = lightnessOf(bg);
    const options: { c: string; change: number }[] = [];
    for (const dir of [-1, 1]) {
      for (let step = 1; step <= 100; step++) {
        const l = start + dir * step * 0.01;
        if (l < 0 || l > 1) break;
        const c = withLightness(bg, l);
        if (best(c) >= CONTRAST.text + 0.5) {
          options.push({ c, change: step });
          break;
        }
      }
    }
    options.sort((a, b) => a.change - b.change);
    if (options[0]) bg = options[0].c;
    notes.push(`Background made a little ${lightnessOf(bg) < start ? 'darker' : 'lighter'} so words stand out.`);
  }
  const light = contrast('#000000', bg) > contrast('#FFFFFF', bg);

  // 2. Text and cards.
  const text = readableOn(bg, primary, CONTRAST.text);
  let panel = light
    ? luminance(bg) > 0.85 ? mix(bg, text, 0.04) : mix(bg, '#FFFFFF', 0.5)
    : mix(bg, text, 0.08);
  // Cards must never weaken the text: if they do, shade them the other way.
  if (contrast(text, panel) < CONTRAST.text) panel = mix(bg, light ? '#FFFFFF' : '#000000', 0.18);
  const textOk = ensureContrast(text, [bg, panel], CONTRAST.text);
  const muted = ensureContrast(mix(textOk, bg, 0.3), [bg, panel], CONTRAST.muted);

  // 3. Highlight colour: readable as big text on the background and cards.
  let accent = secondary.toUpperCase();
  const fixedAccent = ensureContrast(accent, [bg, panel], CONTRAST.accent);
  if (fixedAccent !== accent) {
    notes.push(
      `Highlight colour made ${luminance(fixedAccent) > luminance(accent) ? 'lighter' : 'darker'} so it reads on the background.`,
    );
    accent = fixedAccent;
  }
  const onAccent = ensureContrast(readableOn(accent, primary, 7), [accent], CONTRAST.onAccent);

  return { bg, panel, accent, onAccent, text: textOk, muted, light, notes };
}
