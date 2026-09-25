import Link from 'next/link';
import { bucketize, fullLabel, isRangeId, RANGES, rangeWindow, type RangeId } from '@/lib/earnings';
import { formatWhen } from '@/lib/event-info';
import { naira } from '@/lib/money';
import { requirePlanner } from '@/lib/session';
import { getStore } from '@/lib/store';
import DashShell from '../DashShell';
import EarningsChart from './EarningsChart';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Earnings · DashPad' };

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rangeParam } = await searchParams;
  const range: RangeId = isRangeId(rangeParam) ? rangeParam : '30d';
  const planner = await requirePlanner();
  const store = getStore();

  // Every event this planner ran, including deleted ones: their money was real.
  const events = await store.listEventsByPlanner(planner.id, { includeDeleted: true });
  // One query for all of them, just the money columns.
  const money = (await store.listMoneyRows(events.map((e) => e.id))).filter((t) => !t.outsideWindow);
  const all = money.map((t) => ({ eventId: t.eventId, at: new Date(t.createdAt).getTime(), mine: t.plannerFeeKobo, sprayed: t.amountKobo }));

  const now = Date.now();
  const first = all.length ? all.reduce((m, a) => Math.min(m, a.at), Infinity) : null;
  const { from, unit } = rangeWindow(range, now, first);
  const inRange = all.filter((a) => a.at >= from && a.at <= now);
  const bars = bucketize(inRange.map((a) => ({ at: a.at, kobo: a.mine })), from, unit, now);

  const earned = inRange.reduce((s, a) => s + a.mine, 0);
  const sprayed = inRange.reduce((s, a) => s + a.sprayed, 0);
  const eventsWithMoney = new Set(inRange.map((a) => a.eventId));
  const lifetime = all.reduce((s, a) => s + a.mine, 0);

  // Compared with the same length of time just before.
  let delta: { pct: number; up: boolean } | null = null;
  if (range !== 'all') {
    const len = now - from;
    const before = all.filter((a) => a.at >= from - len && a.at < from).reduce((s, a) => s + a.mine, 0);
    if (before > 0) delta = { pct: Math.round(((earned - before) / before) * 100), up: earned >= before };
  }

  const byEvent = new Map<string, { sprays: number; sprayed: number; mine: number }>();
  for (const a of inRange) {
    const r = byEvent.get(a.eventId) ?? { sprays: 0, sprayed: 0, mine: 0 };
    r.sprays += 1;
    r.sprayed += a.sprayed;
    r.mine += a.mine;
    byEvent.set(a.eventId, r);
  }
  const rows = events
    .filter((e) => byEvent.has(e.id))
    .map((event) => ({ event, ...byEvent.get(event.id)! }))
    .sort((a, b) => b.mine - a.mine);

  const rangeLabel = RANGES.find((r) => r.id === range)!.label.toLowerCase();

  return (
    <DashShell>
      <div className="row-between">
        <h1>Earnings</h1>
        <nav className="range-tabs" aria-label="Time period">
          {RANGES.map((r) => (
            <Link key={r.id} href={`/dashboard/earnings?range=${r.id}`} aria-current={r.id === range ? 'page' : undefined}>
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      <section className="earn-hero" aria-label="Your earnings">
        <div className="hint">You earned {range === 'all' ? 'in total' : `in the last ${rangeLabel}`}</div>
        <div className="earn-hero-v">{naira(earned)}</div>
        {delta && (
          <div className={`earn-delta ${delta.up ? 'up' : 'down'}`}>
            <span aria-hidden="true">{delta.up ? '▲' : '▼'}</span> {Math.abs(delta.pct)}% vs the {rangeLabel} before
          </div>
        )}
        <div className="hint">Paid into {planner.bankName ?? 'your bank'} {planner.accountNumber ? `· ${planner.accountNumber}` : ''} within 2 business days of each spray.</div>
      </section>

      <div className="tiles">
        <div className="tile"><div className="v">{naira(sprayed)}</div><div className="k">Sprayed at your events</div></div>
        <div className="tile"><div className="v">{inRange.length.toLocaleString('en-NG')}</div><div className="k">Sprays</div></div>
        <div className="tile"><div className="v">{eventsWithMoney.size}</div><div className="k">Events with sprays</div></div>
        <div className="tile"><div className="v">{naira(lifetime)}</div><div className="k">Earned all time</div></div>
      </div>

      <EarningsChart
        bars={bars.map((b) => ({ label: b.label, tip: fullLabel(b.start, unit), kobo: b.kobo, sprays: b.sprays }))}
        title="Your earnings over time"
        per={unit}
      />

      <section className="card">
        <h2>By event</h2>
        {rows.length === 0 ? (
          <p className="empty">No sprays in this period.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Event</th><th>Date</th><th>Sprays</th><th>Sprayed</th><th>You earned</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.event.id}>
                    <td>
                      {r.event.deletedAt ? r.event.title : <Link href={`/dashboard/events/${r.event.id}`}>{r.event.title}</Link>}
                      {r.event.deletedAt && <span className="hint"> (deleted)</span>}
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
    </DashShell>
  );
}
