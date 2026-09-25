import { isRangeId, type RangeId } from '@/lib/earnings';
import { requirePlanner } from '@/lib/session';
import { getStore } from '@/lib/store';
import DashShell from '../DashShell';
import EarningsView, { type EarningsRow } from './EarningsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Earnings · DashPad' };

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rangeParam } = await searchParams;
  const range: RangeId = isRangeId(rangeParam) ? rangeParam : '30d';
  const planner = await requirePlanner();
  const store = getStore();

  // Every event this planner ran, including deleted ones: their money was real.
  const events = await store.listEventsByPlanner(planner.id, { includeDeleted: true });
  // One query for all of them, just the money columns, sent to the page in a compact form.
  const index = new Map(events.map((e, i) => [e.id, i]));
  const rows: EarningsRow[] = (await store.listMoneyRows(events.map((e) => e.id)))
    .filter((t) => !t.outsideWindow)
    .map((t) => [index.get(t.eventId)!, new Date(t.createdAt).getTime(), t.plannerFeeKobo, t.amountKobo]);

  return (
    <DashShell>
      <EarningsView
        events={events.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, deleted: !!e.deletedAt }))}
        rows={rows}
        paidInto={`Paid into ${planner.bankName ?? 'your bank'}${planner.accountNumber ? ` · ${planner.accountNumber}` : ''} within 2 business days of each spray.`}
        initialRange={range}
      />
    </DashShell>
  );
}
