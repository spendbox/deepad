import Link from 'next/link';
import { eventPhase } from '@/lib/event-info';
import { naira } from '@/lib/money';
import { requireAdmin } from '@/lib/session';
import { getStore } from '@/lib/store';
import AdminShell from './AdminShell';
import EventsTable from './EventsTable';
import PaymentLogTable from './PaymentLogTable';
import { loadEventsWithTotals } from './data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · DashPad' };

/** The admin home: the money, the latest events and payments, and whether anything needs fixing. */
export default async function AdminHome() {
  await requireAdmin();
  const [data, logs] = await Promise.all([loadEventsWithTotals(), getStore().listPaymentLogs(40)]);
  const { events, planners, total } = data;
  const live = events.filter((e) => eventPhase(e) === 'live' && !e.deletedAt).length;

  return (
    <AdminShell tab="overview">
      <div className="adm-head">
        <div>
          <h1>Overview</h1>
          <p className="adm-sub">Everything on DashPad, across all planners.</p>
        </div>
        <div className="adm-counts">
          <span className="adm-count"><strong>{events.length}</strong>{events.length === 1 ? 'event' : 'events'}</span>
          <span className="adm-count"><strong>{live}</strong>live now</span>
          <span className="adm-count"><strong>{planners.length}</strong>{planners.length === 1 ? 'planner' : 'planners'}</span>
        </div>
      </div>
      <div className="tiles">
        <div className="tile gold"><div className="v">{naira(total.platform - total.processing)}</div><div className="k">DashPad earnings after Paystack fees</div></div>
        <div className="tile dark"><div className="v">{naira(total.sprayed)}</div><div className="k">Total sprayed</div></div>
        <div className="tile"><div className="v">{naira(total.platform)}</div><div className="k">DashPad 5% (before fees)</div></div>
        <div className="tile"><div className="v">{naira(total.processing)}</div><div className="k">Paystack fees paid by DashPad</div></div>
      </div>

      {total.outside > 0 && (
        <div className="banner warn">
          {total.outside} transfer(s) arrived outside their event’s time and were kept off the screen. Open the event to see them.
        </div>
      )}

      <section className="card">
        <div className="row-between">
          <h2>Latest events</h2>
          <Link href="/admin/events" className="adm-see-all">{events.length === 1 ? 'See event' : `All ${events.length} events`} →</Link>
        </div>
        <EventsTable data={data} limit={5} />
      </section>

      <PaymentLogTable logs={logs.slice(0, 5)} title="Latest payment notifications" seeAll="/admin/payments" />
    </AdminShell>
  );
}
