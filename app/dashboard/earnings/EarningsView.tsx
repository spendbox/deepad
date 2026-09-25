'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { bucketize, fullLabel, RANGES, rangeWindow, type RangeId } from '@/lib/earnings';
import { formatWhen } from '@/lib/event-info';
import { naira } from '@/lib/money';
import EarningsChart from './EarningsChart';

export type EarningsEvent = { id: string; title: string; startsAt: string; deleted: boolean };
/** One spray: [index into events, time (ms), your cut (kobo), amount sprayed (kobo)]. */
export type EarningsRow = [number, number, number, number];

/**
 * Everything is loaded once; switching the time period is worked out right
 * here in the browser, so it's instant (no trip to the server).
 */
export default function EarningsView({
  events,
  rows,
  paidInto,
  initialRange,
}: {
  events: EarningsEvent[];
  rows: EarningsRow[];
  paidInto: string;
  initialRange: RangeId;
}) {
  const [range, setRange] = useState<RangeId>(initialRange);
  const [now] = useState(() => Date.now());

  const view = useMemo(() => {
    const first = rows.length ? rows.reduce((m, r) => Math.min(m, r[1]), Infinity) : null;
    const { from, unit } = rangeWindow(range, now, first);
    const inRange = rows.filter((r) => r[1] >= from && r[1] <= now);
    const bars = bucketize(inRange.map((r) => ({ at: r[1], kobo: r[2] })), from, unit, now);
    const earned = inRange.reduce((s, r) => s + r[2], 0);
    const sprayed = inRange.reduce((s, r) => s + r[3], 0);
    const lifetime = rows.reduce((s, r) => s + r[2], 0);
    let delta: { pct: number; up: boolean } | null = null;
    if (range !== 'all') {
      const len = now - from;
      const before = rows.filter((r) => r[1] >= from - len && r[1] < from).reduce((s, r) => s + r[2], 0);
      if (before > 0) delta = { pct: Math.round(((earned - before) / before) * 100), up: earned >= before };
    }
    const byEvent = new Map<number, { sprays: number; sprayed: number; mine: number }>();
    for (const r of inRange) {
      const e = byEvent.get(r[0]) ?? { sprays: 0, sprayed: 0, mine: 0 };
      e.sprays += 1;
      e.sprayed += r[3];
      e.mine += r[2];
      byEvent.set(r[0], e);
    }
    const table = [...byEvent.entries()].map(([i, v]) => ({ event: events[i], ...v })).sort((a, b) => b.mine - a.mine);
    return { unit, bars, earned, sprayed, lifetime, delta, table, sprays: inRange.length, eventCount: byEvent.size };
  }, [range, rows, events, now]);

  const rangeLabel = RANGES.find((r) => r.id === range)!.label.toLowerCase();

  function choose(r: RangeId) {
    setRange(r);
    // Keep the address in step, so a refresh or shared link keeps the same period.
    window.history.replaceState(null, '', `/dashboard/earnings?range=${r}`);
  }

  return (
    <>
      <div className="row-between">
        <h1>Earnings</h1>
        <div className="range-tabs" role="group" aria-label="Time period">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={r.id === range} onClick={() => choose(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <section className="earn-hero" aria-label="Your earnings" aria-live="polite">
        <div className="hint">You earned {range === 'all' ? 'in total' : `in the last ${rangeLabel}`}</div>
        <div className="earn-hero-v">{naira(view.earned)}</div>
        {view.delta && (
          <div className={`earn-delta ${view.delta.up ? 'up' : 'down'}`}>
            <span aria-hidden="true">{view.delta.up ? '▲' : '▼'}</span> {Math.abs(view.delta.pct)}% vs the {rangeLabel} before
          </div>
        )}
        <div className="hint">{paidInto}</div>
      </section>

      <div className="tiles">
        <div className="tile"><div className="v">{naira(view.sprayed)}</div><div className="k">Sprayed at your events</div></div>
        <div className="tile"><div className="v">{view.sprays.toLocaleString('en-NG')}</div><div className="k">Sprays</div></div>
        <div className="tile"><div className="v">{view.eventCount}</div><div className="k">Events with sprays</div></div>
        <div className="tile"><div className="v">{naira(view.lifetime)}</div><div className="k">Earned all time</div></div>
      </div>

      <EarningsChart
        key={range}
        bars={view.bars.map((b) => ({ label: b.label, tip: fullLabel(b.start, view.unit), kobo: b.kobo, sprays: b.sprays }))}
        title="Your earnings over time"
        per={view.unit}
      />

      <section className="card">
        <h2>By event</h2>
        {view.table.length === 0 ? (
          <p className="empty">No sprays in this period.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Event</th><th>Date</th><th>Sprays</th><th>Sprayed</th><th>You earned</th></tr></thead>
              <tbody>
                {view.table.map((r) => (
                  <tr key={r.event.id}>
                    <td>
                      {r.event.deleted ? r.event.title : <Link href={`/dashboard/events/${r.event.id}`}>{r.event.title}</Link>}
                      {r.event.deleted && <span className="hint"> (deleted)</span>}
                    </td>
                    <td className="num">{formatWhen(r.event.startsAt)}</td>
                    <td className="num">{r.sprays}</td>
                    <td className="num">{naira(r.sprayed)}</td>
                    <td className="num"><strong>{naira(r.mine)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
