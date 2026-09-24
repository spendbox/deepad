import Link from 'next/link';
import { eventPhase, formatWhen } from '@/lib/event-info';
import { summarise } from '@/lib/events';
import { naira, percent } from '@/lib/money';
import { requireAdmin } from '@/lib/session';
import { getStore } from '@/lib/store';
import PhasePill from '../dashboard/PhasePill';
import AdminShell from './AdminShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · DashPad' };

export default async function AdminHome() {
  await requireAdmin();
  const store = getStore();
  const [planners, events] = await Promise.all([store.listPlanners(), store.listEvents()]);
  const sums = await Promise.all(events.map(async (e) => summarise(await store.listTransfers(e.id, 100000))));
  const plannerName = new Map(planners.map((p) => [p.id, p.name]));
  const total = sums.reduce((a, s) => ({ sprayed: a.sprayed + s.totalKobo, platform: a.platform + s.platformKobo, outside: a.outside + s.outside.length }), { sprayed: 0, platform: 0, outside: 0 });

  return (
    <AdminShell>
      <h1>Overview</h1>
      <div className="tiles">
        <div className="tile gold"><div className="v">{naira(total.platform)}</div><div className="k">DashPad earnings (5%)</div></div>
        <div className="tile"><div className="v">{naira(total.sprayed)}</div><div className="k">Total sprayed</div></div>
        <div className="tile"><div className="v">{events.length}</div><div className="k">Events</div></div>
        <div className="tile"><div className="v">{planners.length}</div><div className="k">Planners</div></div>
      </div>
      {total.outside > 0 && (
        <div className="banner warn">
          {total.outside} transfer(s) arrived outside their event’s time and were kept off the screen. Open the event to see them.
        </div>
      )}

      <section className="card">
        <h2>Events</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Event</th><th>Planner</th><th>When</th><th>Status</th><th>Sprayed</th><th>Planner cut</th><th>Account</th></tr></thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={e.id}>
                  <td><Link href={`/admin/events/${e.id}`}>{e.title}</Link></td>
                  <td>{plannerName.get(e.plannerId) ?? '—'}</td>
                  <td className="num">{formatWhen(e.startsAt)}</td>
                  <td><PhasePill phase={eventPhase(e)} /></td>
                  <td className="num"><strong>{naira(sums[i].totalKobo)}</strong></td>
                  <td className="num">{percent(e.plannerFeeBps)}</td>
                  <td>{e.setupStatus === 'ready' ? e.accountNumber : <span className={`pill ${e.setupStatus === 'failed' ? 'failed' : ''}`}>{e.setupStatus}</span>}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={7}>No events yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Planners</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Payout account</th><th>Joined</th></tr></thead>
            <tbody>
              {planners.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.email}</td>
                  <td>{p.phone}</td>
                  <td>{p.accountNumber ? `${p.bankName} · ${p.accountNumber}` : '—'}</td>
                  <td className="num">{new Date(p.createdAt).toLocaleDateString('en-NG')}</td>
                </tr>
              ))}
              {planners.length === 0 && <tr><td colSpan={5}>No planners yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
