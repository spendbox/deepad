import Link from 'next/link';
import { eventPhase, formatWhen } from '@/lib/event-info';
import { naira } from '@/lib/money';
import { requirePlanner } from '@/lib/session';
import { getStore } from '@/lib/store';
import DashShell from './DashShell';
import PhasePill from './PhasePill';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your events · DashPad' };

export default async function Dashboard() {
  const planner = await requirePlanner();
  const store = getStore();
  const events = await store.listEventsByPlanner(planner.id);
  const stats = await Promise.all(events.map((e) => store.eventStats(e.id)));
  const needsBank = !planner.accountNumber;

  return (
    <DashShell>
      <div className="row-between">
        <div>
          <p className="hint" style={{ margin: 0 }}>Hi {planner.name.split(' ')[0]}</p>
          <h1>Your events</h1>
        </div>
        <Link href="/dashboard/events/new" className="btn btn-dark">+ New event</Link>
      </div>

      {needsBank && (
        <div className="banner warn">
          <strong>Add your bank account</strong> so we can pay your cut from each event.{' '}
          <Link href="/dashboard/profile">Add it now</Link>
        </div>
      )}

      {events.length === 0 ? (
        <div className="card empty">
          <h2 style={{ color: 'var(--aubergine)' }}>No events yet</h2>
          <p style={{ margin: 0 }}>Create your first spray event. It takes about two minutes.</p>
          <div><Link href="/dashboard/events/new" className="btn btn-dark btn-lg">Create an event</Link></div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {events.map((e, i) => (
            <Link key={e.id} href={`/dashboard/events/${e.id}`} className="card event-card">
              <div className="row-between">
                <span className="title">{e.title}</span>
                <PhasePill phase={eventPhase(e)} />
              </div>
              <div className="row-between">
                <span className="hint">{formatWhen(e.startsAt)}</span>
                <span className="display tabular">{naira(stats[i].totalKobo)}</span>
              </div>
              {e.setupStatus !== 'ready' && (
                <span className="hint" style={{ color: 'var(--danger)' }}>Account number not ready yet</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </DashShell>
  );
}
