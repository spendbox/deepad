import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Planner, SprayEvent, Transfer } from './types';

// The after-event report as a clean, branded A4 PDF.
// Amounts use "NGN" because the built-in PDF fonts have no naira sign.

const A4 = { w: 595.28, h: 841.89 };
const M = 40; // page margin
const C = {
  aubergine: rgb(0x1f / 255, 0x0a / 255, 0x26 / 255),
  plum: rgb(0x33 / 255, 0x16 / 255, 0x3d / 255),
  gold: rgb(0xf2 / 255, 0xb4 / 255, 0x37 / 255),
  green: rgb(0x1f / 255, 0x7a / 255, 0x4d / 255),
  ivory: rgb(0xff / 255, 0xf6 / 255, 0xe6 / 255),
  wash: rgb(0xf7 / 255, 0xf0 / 255, 0xf9 / 255),
  line: rgb(0xe3 / 255, 0xd3 / 255, 0xe8 / 255),
  ink: rgb(0x1f / 255, 0x0a / 255, 0x26 / 255),
  muted: rgb(0x5e / 255, 0x4a / 255, 0x66 / 255),
  white: rgb(1, 1, 1),
};

/** The built-in fonts only know Western characters: simplify everything else. */
function safe(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/₦/g, 'NGN ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .trim();
}

const ngn = (kobo: number) =>
  'NGN ' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 });

const when = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', ...opts });

/** Cut text to fit a width, adding "..." if needed. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > width) t = t.slice(0, -1);
  return t + '...';
}

function drawLogo(page: PDFPage, x: number, yTop: number, size: number) {
  const s = size / 64;
  // Rounded square
  page.drawSvgPath('M15 0 H49 A15 15 0 0 1 64 15 V49 A15 15 0 0 1 49 64 H15 A15 15 0 0 1 0 49 V15 A15 15 0 0 1 15 0 Z', {
    x, y: yTop, scale: s, color: C.plum,
  });
  // Gold "D"
  page.drawSvgPath('M17 15 H29.5 A17 17 0 0 1 29.5 49 H17 Z', {
    x, y: yTop, scale: s, borderColor: C.gold, borderWidth: 7.5 * s,
  });
  // Green note
  page.drawSvgPath('M40 13 L57 5 L62 16 L45 24 Z', { x, y: yTop, scale: s, color: C.green });
}

export async function buildReportPdf(event: SprayEvent, planner: Planner, transfers: Transfer[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`${event.title} - DashPad report`));
  doc.setAuthor('DashPad');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const counted = transfers.filter((t) => !t.outsideWindow);
  const outside = transfers.filter((t) => t.outsideWindow);
  const total = counted.reduce((s, t) => s + t.amountKobo, 0);
  const plannerKobo = counted.reduce((s, t) => s + t.plannerFeeKobo, 0);
  const celebrantKobo = counted.reduce((s, t) => s + t.celebrantKobo, 0);
  const senders = new Set(counted.map((t) => (t.senderName ?? '').trim().toLowerCase()).filter(Boolean)).size;

  const pages: PDFPage[] = [];
  const newPage = () => {
    const p = doc.addPage([A4.w, A4.h]);
    pages.push(p);
    return p;
  };

  // ----- Page 1 header -----
  let page = newPage();
  page.drawRectangle({ x: 0, y: A4.h - 96, width: A4.w, height: 96, color: C.aubergine });
  drawLogo(page, M, A4.h - 26, 44);
  page.drawText('Dash', { x: M + 54, y: A4.h - 58, size: 22, font: bold, color: C.ivory });
  page.drawText('Pad', { x: M + 54 + bold.widthOfTextAtSize('Dash', 22), y: A4.h - 58, size: 22, font: bold, color: C.gold });
  const tag = 'Event report';
  page.drawText(tag, { x: A4.w - M - regular.widthOfTextAtSize(tag, 12), y: A4.h - 56, size: 12, font: regular, color: C.ivory });

  let y = A4.h - 136;
  page.drawText(fit(event.title, bold, 22, A4.w - 2 * M), { x: M, y, size: 22, font: bold, color: C.ink });
  y -= 20;
  const dates = `${when(event.startsAt, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}  to  ${when(event.endsAt, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}`;
  page.drawText(safe(dates), { x: M, y, size: 10.5, font: regular, color: C.muted });
  y -= 15;
  page.drawText(fit(`Prepared for ${planner.name} · ${planner.email}`, regular, 10.5, A4.w - 2 * M), { x: M, y, size: 10.5, font: regular, color: C.muted });

  // ----- Summary boxes -----
  y -= 28;
  const boxes: [string, string, boolean][] = [
    ['Total sprayed', ngn(total), true],
    ['Sprays', counted.length.toLocaleString('en-NG'), false],
    ['Different senders', senders.toLocaleString('en-NG'), false],
    [`Your earnings (${(event.plannerFeeBps / 100).toFixed(0)}%)`, ngn(plannerKobo), false],
  ];
  const gap = 10;
  const bw = (A4.w - 2 * M - gap * 3) / 4;
  const bh = 58;
  boxes.forEach(([label, value, gold], i) => {
    const bx = M + i * (bw + gap);
    page.drawRectangle({ x: bx, y: y - bh, width: bw, height: bh, color: gold ? C.gold : C.wash, borderColor: gold ? C.gold : C.line, borderWidth: 1 });
    page.drawText(fit(label, regular, 9, bw - 16), { x: bx + 10, y: y - 18, size: 9, font: regular, color: gold ? C.ink : C.muted });
    page.drawText(fit(value, bold, 15, bw - 16), { x: bx + 10, y: y - 42, size: 15, font: bold, color: C.ink });
  });
  y -= bh + 18;
  page.drawText(fit(`Paid to ${event.celebrantName}: ${ngn(celebrantKobo)}  ·  Payouts reach bank accounts within 2 business days of each spray.`, regular, 10, A4.w - 2 * M), {
    x: M, y, size: 10, font: regular, color: C.muted,
  });
  if (outside.length) {
    y -= 15;
    page.drawText(fit(`${outside.length} transfer(s) arrived outside the event time and are not included. DashPad will contact you about them.`, regular, 10, A4.w - 2 * M), {
      x: M, y, size: 10, font: regular, color: rgb(0.54, 0.29, 0),
    });
  }

  // ----- Table -----
  y -= 30;
  page.drawText('Who sprayed', { x: M, y, size: 14, font: bold, color: C.ink });
  y -= 14;
  const cols = [
    { title: 'Time', w: 52 },
    { title: 'Sender', w: 150 },
    { title: 'Bank', w: 88 },
    { title: 'Amount', w: 88, right: true },
    { title: 'Message', w: A4.w - 2 * M - 52 - 150 - 88 - 88 },
  ];
  const rowH = 20;
  const header = (p: PDFPage, top: number) => {
    p.drawRectangle({ x: M, y: top - rowH, width: A4.w - 2 * M, height: rowH, color: C.aubergine });
    let x = M;
    for (const c of cols) {
      const tx = c.right ? x + c.w - 8 - bold.widthOfTextAtSize(c.title, 9) : x + 8;
      p.drawText(c.title, { x: tx, y: top - 13.5, size: 9, font: bold, color: C.ivory });
      x += c.w;
    }
    return top - rowH;
  };
  y = header(page, y);

  if (counted.length === 0) {
    y -= 22;
    page.drawText('No sprays were received.', { x: M + 8, y, size: 10, font: regular, color: C.muted });
  }
  counted.forEach((t, i) => {
    if (y - rowH < M + 30) {
      page = newPage();
      y = header(page, A4.h - M);
    }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: A4.w - 2 * M, height: rowH, color: C.wash });
    const cells = [
      when(t.createdAt, { hour: '2-digit', minute: '2-digit' }),
      t.senderName ?? 'Unknown',
      t.senderBank ?? '',
      ngn(t.amountKobo),
      t.message ?? '',
    ];
    let x = M;
    cols.forEach((c, ci) => {
      const font = ci === 3 ? bold : regular;
      const txt = fit(cells[ci], font, 9, c.w - 14);
      const tx = c.right ? x + c.w - 8 - font.widthOfTextAtSize(txt, 9) : x + 8;
      page.drawText(txt, { x: tx, y: y - 13.5, size: 9, font, color: C.ink });
      x += c.w;
    });
    y -= rowH;
  });
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.8, color: C.line });

  // ----- Footer on every page -----
  pages.forEach((p, i) => {
    const text = `DashPad · Sender names come from their bank accounts; on the big screen every spray was anonymous.`;
    p.drawText(fit(text, regular, 8, A4.w - 2 * M - 70), { x: M, y: 22, size: 8, font: regular, color: C.muted });
    const num = `Page ${i + 1} of ${pages.length}`;
    p.drawText(num, { x: A4.w - M - regular.widthOfTextAtSize(num, 8), y: 22, size: 8, font: regular, color: C.muted });
  });

  return doc.save();
}

export function reportFileName(event: SprayEvent): string {
  return `DashPad-report-${event.slug}.pdf`;
}
