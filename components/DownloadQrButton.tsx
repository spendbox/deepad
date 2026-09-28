'use client';

import { useState } from 'react';

/**
 * Downloads a print-ready picture: a heading, the QR code for `url`, and the
 * link written underneath (for anyone who can't scan). Made on the phone or
 * laptop itself, so nothing is uploaded anywhere.
 */
export default function DownloadQrButton({ url, heading, fileName, label = 'Download QR code' }: { url: string; heading: string; fileName: string; label?: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const QRCode = (await import('qrcode')).default;
      const W = 1200;
      const H = 1500;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFF6E6';
      ctx.fillRect(0, 0, W, H);

      // Heading, wrapped onto up to two lines.
      ctx.fillStyle = '#1F0A26';
      ctx.textAlign = 'center';
      ctx.font = '800 64px system-ui, sans-serif';
      const lines = wrap(ctx, heading, W - 160).slice(0, 2);
      lines.forEach((l, i) => ctx.fillText(l, W / 2, 150 + i * 78));

      // The QR code on a white card.
      const qr = document.createElement('canvas');
      await QRCode.toCanvas(qr, url, { width: 860, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1F0A26', light: '#FFFFFF' } });
      const top = 150 + lines.length * 78 + 20;
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, (W - 920) / 2, top, 920, 920, 40);
      ctx.fill();
      ctx.drawImage(qr, (W - 860) / 2, top + 30, 860, 860);

      // The link, and who made it.
      ctx.fillStyle = '#5E4A66';
      ctx.font = '600 40px system-ui, sans-serif';
      ctx.fillText('Scan with your phone camera, or visit', W / 2, top + 1000);
      ctx.fillStyle = '#1F0A26';
      ctx.font = '800 44px system-ui, sans-serif';
      ctx.fillText(wrap(ctx, url.replace(/^https?:\/\//, ''), W - 120)[0], W / 2, top + 1060);
      ctx.fillStyle = '#B98A2E';
      ctx.font = '800 34px system-ui, sans-serif';
      ctx.fillText('DashPad', W / 2, H - 50);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = fileName;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-sm" onClick={download} disabled={busy}>
      {busy ? 'Making…' : label}
    </button>
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
