'use client';

import { useEffect, useRef, useState } from 'react';
import { naira } from '@/lib/money';

type Bar = { label: string; kobo: number; sprays: number };

const BAR = '#8A3FA3'; // plum: passes the lightness and 3:1 contrast checks on white
const GRID = '#EDE3F0';
const INK = '#1F0A26';
const MUTED = '#5E4A66';
const HEIGHT = 260;
const PAD = { top: 16, right: 8, bottom: 30, left: 64 };

/** A "nice" top for the axis: 1, 2 or 5 × a power of ten, in naira. */
function niceMax(kobo: number): number {
  const n = Math.max(kobo / 100, 1);
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 5, 10]) if (n <= m * pow) return m * pow * 100;
  return 10 * pow * 100;
}

function compactNaira(kobo: number): string {
  const n = kobo / 100;
  if (n >= 1_000_000) return `₦${Number((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `₦${Number((n / 1_000).toFixed(1))}K`;
  return `₦${Math.round(n)}`;
}

/** One series (your earnings), so no legend: the heading says what is plotted. */
export default function EarningsChart({ bars, title }: { bars: Bar[]; title: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...bars.map((b) => b.kobo)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / Math.max(bars.length, 1);
  const barW = Math.max(3, Math.min(24, band - 2)); // capped at 24px, 2px air between neighbours
  const y = (kobo: number) => PAD.top + plotH - (kobo / max) * plotH;
  const everyNth = Math.max(1, Math.ceil(bars.length / Math.floor(plotW / 56))); // x labels that don't collide
  const total = bars.reduce((s, b) => s + b.kobo, 0);

  return (
    <div className="chart-card">
      <div className="row-between">
        <h2>{title}</h2>
        <button type="button" className="btn btn-sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Period</th><th>Sprays</th><th>You earned</th></tr></thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.label}><td>{b.label}</td><td className="num">{b.sprays}</td><td className="num">{naira(b.kobo)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} style={{ position: 'relative' }}>
          {total === 0 && <p className="chart-empty">No earnings in this period yet.</p>}
          <svg width={width} height={HEIGHT} role="img" aria-label={`${title}: bar chart, ${naira(total)} in total`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
                <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize="12" fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {compactNaira(t)}
                </text>
              </g>
            ))}
            {bars.map((b, i) => {
              const cx = PAD.left + band * i + band / 2;
              const h = Math.max(0, (b.kobo / max) * plotH);
              const x = cx - barW / 2;
              const top = PAD.top + plotH - h;
              const r = Math.min(4, barW / 2, h);
              // Rounded data end at the top, square at the baseline.
              const d = h > 0
                ? `M${x},${PAD.top + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${PAD.top + plotH} Z`
                : '';
              return (
                <g key={b.label}>
                  {d && <path d={d} fill={BAR} opacity={hover === null || hover === i ? 1 : 0.55} />}
                  {i % everyNth === 0 && (
                    <text x={cx} y={HEIGHT - 10} textAnchor="middle" fontSize="12" fill={MUTED}>{b.label}</text>
                  )}
                  {/* The whole column is the hover target, bigger than the bar. */}
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onTouchStart={() => setHover(i)}
                  />
                </g>
              );
            })}
            <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="#CBB8D2" strokeWidth="1" />
          </svg>
          {hover !== null && bars[hover] && (
            <div
              className="chart-tip"
              style={{
                left: Math.min(Math.max(PAD.left + band * hover + band / 2, 80), width - 80),
                top: Math.max(y(bars[hover].kobo) - 12, 0),
              }}
              role="status"
            >
              <div style={{ color: MUTED, fontSize: 12 }}>{bars[hover].label}</div>
              <div style={{ color: INK, fontWeight: 700 }}>{naira(bars[hover].kobo)}</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{bars[hover].sprays} spray{bars[hover].sprays === 1 ? '' : 's'}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
