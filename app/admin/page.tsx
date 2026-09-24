import Link from 'next/link';
import { naira } from '@/lib/money';
import { getStore } from '@/lib/store';
import AdminShell from './AdminShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Events · DashPad admin' };

export default async function AdminHome() {
  const store = getStore();
  const events = await store.listEvents();
  const stats = await Promise.all(events.map((e) => store.eventStats(e.id)));

  return (
    <AdminShell>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <h1>Events</h1>
        <Link href="/admin/events/new" className="btn dark">+ New event</Link>
      </div>
      <div className="panel">
        {events.length === 0 ? (
          <p>No events yet. Create your first one.</p>
        ) : (
          <div className="event-list">
            {events.map((e, i) => (
              <Link key={e.id} href={`/admin/events/${e.id}`} className="event-item card">
                <div>
                  <strong style={{ fontSize: 17 }}>{e.title}</strong>
                  <div className="hint">
                    /{e.slug} · {e.mcName || 'No MC set'}
                  </div>
                </div>
                <div className="actions">
                  <span className="tabular" style={{ fontWeight: 700 }}>{naira(stats[i].totalKobo)}</span>
                  <span className={`pill ${e.status}`}>{e.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
