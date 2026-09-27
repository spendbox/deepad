import { requireAdmin } from '@/lib/session';
import AdminShell from '../AdminShell';
import EventsTable from '../EventsTable';
import { loadEventsWithTotals } from '../data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Events · Admin · DashPad' };

export default async function AdminEvents() {
  await requireAdmin();
  const data = await loadEventsWithTotals();
  return (
    <AdminShell tab="events">
      <div className="adm-head">
        <div>
          <h1>Events</h1>
          <p className="adm-sub">Every event, newest first. Open one to see its transfers and fix payment problems.</p>
        </div>
      </div>
      <section className="card">
        <EventsTable data={data} />
      </section>
    </AdminShell>
  );
}
