// Naira notes, drawn in the browser (no image files): the same look for the
// guest's wad on their phone and the notes flying on the big screen. An
// illustration in the style of real notes (cream paper border, engraved
// portrait oval, coat-of-arms shield, bank name, corner numerals, red serial
// numbers, signatures, security thread, watermark window), not a copy of them.

export type NairaValue = 100 | 200 | 500 | 1000;

type Palette = { paper: string; ink: string; main: string; tint: string; accent: string; words: string; serial: string };

// Colours close to each note: ₦1000 copper-brown, ₦500 violet-blue, ₦200 teal-blue, ₦100 crimson.
const PALETTE: Record<NairaValue, Palette> = {
  1000: { paper: '#F1E6CE', ink: '#5A2F17', main: '#A7653A', tint: '#E3B47E', accent: '#3F6B4F', words: 'ONE THOUSAND NAIRA', serial: 'AD 4172058' },
  500: { paper: '#EEEBF3', ink: '#27245E', main: '#5856A6', tint: '#B2AFE0', accent: '#5E8A55', words: 'FIVE HUNDRED NAIRA', serial: 'BK 2689314' },
  200: { paper: '#E8F1EE', ink: '#174653', main: '#2E7F93', tint: '#94CFD9', accent: '#B08A3A', words: 'TWO HUNDRED NAIRA', serial: 'CL 5903127' },
  100: { paper: '#F5E9EB', ink: '#621A2D', main: '#AE3E5C', tint: '#EDA9BB', accent: '#3E6FA0', words: 'ONE HUNDRED NAIRA', serial: 'EF 7340921' },
};

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A rosette: rings turned around a centre, like the fine engraved patterns on notes. */
function rosette(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, color: string, width: number, petals = 11) {
  g.strokeStyle = color;
  g.lineWidth = width;
  const n = petals * 3;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    g.beginPath();
    g.arc(cx + Math.cos(t) * R * 0.5, cy + Math.sin(t) * R * 0.5, R * 0.5, 0, Math.PI * 2);
    g.stroke();
  }
}

/** Tiny random specks, so the paper doesn't look flat. */
function paperGrain(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  g.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < (w * h) / 90; i++) g.fillRect(rnd() * w, rnd() * h, 0.7, 0.7);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < (w * h) / 140; i++) g.fillRect(rnd() * w, rnd() * h, 0.7, 0.7);
}

/** The Nigerian coat of arms, simplified: an eagle over a dark shield with the white "Y" of the Niger and Benue. */
function coatOfArms(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, p: Palette) {
  // Shield
  g.beginPath();
  g.moveTo(cx - s * 0.5, cy - s * 0.45);
  g.lineTo(cx + s * 0.5, cy - s * 0.45);
  g.lineTo(cx + s * 0.5, cy + s * 0.1);
  g.quadraticCurveTo(cx + s * 0.5, cy + s * 0.55, cx, cy + s * 0.72);
  g.quadraticCurveTo(cx - s * 0.5, cy + s * 0.55, cx - s * 0.5, cy + s * 0.1);
  g.closePath();
  g.fillStyle = p.ink;
  g.fill();
  // The white Y
  g.strokeStyle = '#F7F1E3';
  g.lineWidth = s * 0.16;
  g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(cx - s * 0.38, cy - s * 0.38);
  g.lineTo(cx, cy + s * 0.05);
  g.lineTo(cx + s * 0.38, cy - s * 0.38);
  g.moveTo(cx, cy + s * 0.05);
  g.lineTo(cx, cy + s * 0.62);
  g.stroke();
  // Eagle on top
  g.fillStyle = '#B3262E';
  g.beginPath();
  g.moveTo(cx, cy - s * 0.58);
  g.lineTo(cx - s * 0.34, cy - s * 0.78);
  g.lineTo(cx - s * 0.14, cy - s * 0.55);
  g.lineTo(cx, cy - s * 0.66);
  g.lineTo(cx + s * 0.14, cy - s * 0.55);
  g.lineTo(cx + s * 0.34, cy - s * 0.78);
  g.closePath();
  g.fill();
  // Supporters (the two horses), as soft shapes either side
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + side * s * 0.78, cy + s * 0.05, s * 0.2, s * 0.42, side * 0.25, 0, Math.PI * 2);
    g.fill();
  }
}

/** An engraved portrait oval: fine horizontal lines, a head-and-shoulders bust. */
function portrait(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, p: Palette) {
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.clip();
  const bg = g.createRadialGradient(cx, cy - ry * 0.2, 0, cx, cy, ry * 1.1);
  bg.addColorStop(0, p.tint);
  bg.addColorStop(1, p.main);
  g.fillStyle = bg;
  g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
  // Bust
  g.fillStyle = p.ink;
  g.globalAlpha = 0.72;
  g.beginPath();
  g.ellipse(cx, cy - ry * 0.18, rx * 0.34, ry * 0.3, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(cx - rx * 0.95, cy + ry);
  g.quadraticCurveTo(cx - rx * 0.8, cy + ry * 0.18, cx, cy + ry * 0.14);
  g.quadraticCurveTo(cx + rx * 0.8, cy + ry * 0.18, cx + rx * 0.95, cy + ry);
  g.closePath();
  g.fill();
  // Cap, as worn in many of the notes' portraits
  g.beginPath();
  g.ellipse(cx, cy - ry * 0.42, rx * 0.3, ry * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  // Engraving lines over it all
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = Math.max(0.5, ry * 0.012);
  for (let y = cy - ry; y < cy + ry; y += Math.max(1.6, ry * 0.035)) {
    g.beginPath();
    g.moveTo(cx - rx, y);
    g.lineTo(cx + rx, y + ry * 0.04);
    g.stroke();
  }
  g.restore();
  // Double frame
  g.strokeStyle = p.ink;
  g.lineWidth = Math.max(1, ry * 0.03);
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = Math.max(0.6, ry * 0.012);
  g.beginPath();
  g.ellipse(cx, cy, rx * 1.07, ry * 1.06, 0, 0, Math.PI * 2);
  g.stroke();
}

function signature(g: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, seed: number) {
  g.strokeStyle = color;
  g.lineWidth = Math.max(0.8, w * 0.03);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    g.quadraticCurveTo(x + w * (t - 0.08), y - w * 0.28 * Math.sin(i * 2.1 + seed), x + w * t, y + w * 0.06 * Math.cos(i * 1.7 + seed));
  }
  g.stroke();
}

/**
 * One note, `w` wide (its height follows the real notes' shape, about half its width),
 * drawn at `dpr` times for sharpness. `side`: the front, or the back (seen while it flips).
 */
export function drawNaira(value: NairaValue, w: number, dpr: number, side: 'front' | 'back' = 'front'): HTMLCanvasElement {
  const h = Math.round(w * 0.515);
  const p = PALETTE[value];
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const serif = 'Georgia, "Times New Roman", serif';
  const r = h * 0.035;
  const m = h * 0.05; // the unprinted cream border

  // Paper
  roundRect(g, 0, 0, w, h, r);
  g.fillStyle = p.paper;
  g.fill();
  g.save();
  roundRect(g, 0, 0, w, h, r);
  g.clip();

  // The printed field
  const field = g.createLinearGradient(0, 0, w, h);
  field.addColorStop(0, p.tint);
  field.addColorStop(0.4, p.main);
  field.addColorStop(0.62, p.main);
  field.addColorStop(1, p.tint);
  g.fillStyle = field;
  g.fillRect(m, m, w - m * 2, h - m * 2);
  g.save();
  g.beginPath();
  g.rect(m, m, w - m * 2, h - m * 2);
  g.clip();
  // Fine wavy lines across the whole field
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = Math.max(0.4, h * 0.004);
  for (let i = 0; i < 34; i++) {
    g.beginPath();
    for (let x = m; x <= w - m; x += 4) {
      const y = m + ((h - 2 * m) / 34) * i + Math.sin(x / (w * 0.05) + i * 0.7) * h * 0.02;
      if (x === m) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  if (side === 'front') {
    // Rosettes behind the coat of arms and the numeral
    rosette(g, w * 0.5, h * 0.48, h * 0.36, 'rgba(255,255,255,0.16)', Math.max(0.4, h * 0.0035), 13);
    rosette(g, w * 0.88, h * 0.74, h * 0.18, 'rgba(255,255,255,0.14)', Math.max(0.3, h * 0.003), 9);
    // Watermark window: plain paper with a faint ghost portrait
    g.fillStyle = p.paper;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.ellipse(w * 0.82, h * 0.44, h * 0.17, h * 0.23, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.12;
    g.fillStyle = p.ink;
    g.beginPath();
    g.ellipse(w * 0.82, h * 0.4, h * 0.06, h * 0.075, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(w * 0.82, h * 0.58, h * 0.12, h * 0.07, 0, Math.PI, 0);
    g.fill();
    g.globalAlpha = 1;
    // Security thread
    g.fillStyle = 'rgba(40,40,40,0.55)';
    for (let y = m; y < h - m; y += h * 0.07) g.fillRect(w * 0.7, y, h * 0.022, h * 0.045);
    // Portrait
    portrait(g, w * 0.2, h * 0.52, h * 0.25, h * 0.31, p);
    // Coat of arms
    coatOfArms(g, w * 0.5, h * 0.5, h * 0.22, p);
  } else {
    // The back: a landscape band and a big outlined numeral
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.moveTo(m, h * 0.72);
    for (let x = m; x <= w - m; x += w * 0.05) g.lineTo(x, h * 0.62 - Math.abs(Math.sin(x / (w * 0.13))) * h * 0.14);
    g.lineTo(w - m, h - m);
    g.lineTo(m, h - m);
    g.closePath();
    g.fill();
    rosette(g, w * 0.26, h * 0.42, h * 0.28, 'rgba(255,255,255,0.16)', Math.max(0.4, h * 0.0035), 12);
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = Math.max(1, h * 0.012);
    g.font = `900 ${Math.round(h * 0.42)}px ${serif}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeText(String(value), w * 0.66, h * 0.46);
  }
  g.restore();

  // Inner printed frame
  g.strokeStyle = p.ink;
  g.globalAlpha = 0.45;
  g.lineWidth = Math.max(0.6, h * 0.008);
  g.strokeRect(m + h * 0.015, m + h * 0.015, w - 2 * m - h * 0.03, h - 2 * m - h * 0.03);
  g.globalAlpha = 1;

  g.textBaseline = 'alphabetic';
  if (side === 'front') {
    // Bank name across the top
    g.fillStyle = p.ink;
    g.textAlign = 'center';
    g.font = `700 ${Math.round(h * 0.078)}px ${serif}`;
    g.fillText('CENTRAL BANK OF NIGERIA', w * 0.6, m + h * 0.105);
    // Corner numerals
    g.textAlign = 'left';
    g.font = `900 ${Math.round(h * 0.17)}px ${serif}`;
    g.fillStyle = '#FFFFFF';
    g.fillText(String(value), m + h * 0.05, m + h * 0.17);
    g.textAlign = 'right';
    g.font = `900 ${Math.round(h * 0.25)}px ${serif}`;
    g.lineWidth = Math.max(1, h * 0.012);
    g.strokeStyle = p.ink;
    g.strokeText(String(value), w - m - h * 0.05, h - m - h * 0.06);
    g.fillStyle = p.tint;
    g.fillText(String(value), w - m - h * 0.05, h - m - h * 0.06);
    // Value in words, and the ₦ sign
    g.textAlign = 'center';
    g.fillStyle = p.ink;
    g.font = `700 ${Math.round(h * 0.062)}px ${serif}`;
    g.fillText(p.words, w * 0.5, h - m - h * 0.07);
    g.font = `900 ${Math.round(h * 0.12)}px ${serif}`;
    g.fillStyle = '#FFFFFF';
    g.fillText('₦', w * 0.5, h * 0.3);
    // Signatures with their titles
    signature(g, w * 0.33, h * 0.7, w * 0.09, p.ink, value);
    signature(g, w * 0.56, h * 0.7, w * 0.09, p.ink, value * 1.7);
    g.font = `700 ${Math.round(h * 0.028)}px ${serif}`;
    g.fillStyle = p.ink;
    g.fillText('GOVERNOR', w * 0.375, h * 0.745);
    g.fillText('DIRECTOR OF CURRENCY', w * 0.605, h * 0.745);
    // Red serial numbers
    g.fillStyle = '#C22A2F';
    g.font = `700 ${Math.round(h * 0.06)}px "Courier New", monospace`;
    g.textAlign = 'right';
    g.fillText(p.serial, w - m - h * 0.06, m + h * 0.19);
    g.textAlign = 'left';
    g.fillText(p.serial, m + h * 0.08, h - m - h * 0.05);
  } else {
    g.fillStyle = p.ink;
    g.textAlign = 'center';
    g.font = `700 ${Math.round(h * 0.07)}px ${serif}`;
    g.fillText('CENTRAL BANK OF NIGERIA', w * 0.5, m + h * 0.1);
    g.font = `700 ${Math.round(h * 0.06)}px ${serif}`;
    g.fillText(p.words, w * 0.5, h - m - h * 0.06);
  }

  paperGrain(g, w, h, value * 97 + (side === 'back' ? 13 : 0));
  g.restore();
  // A crisp edge
  roundRect(g, 0.5, 0.5, w - 1, h - 1, r);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1;
  g.stroke();
  return c;
}
