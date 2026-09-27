import { naira } from '@/lib/money';
import { requireAdmin } from '@/lib/session';
import AdminShell from '../AdminShell';
import { loadEventsWithTotals } from '../data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Planners · Admin · DashPad' };

export default async function AdminPlanners() {
  await requireAdmin();
  const { planners, events, sums } = await loadEventsWithTotals();
  // Each planner's events and what they've earned from them.
  const stats = new Map(planners.map((p) => [p.id, { events: 0, earned: 0 }]));
  for (const e of events) {
    const st = stats.get(e.plannerId);
    if (!st) continue;
    st.events += 1;
    st.earned += sums.get(e.id)?.plannerKobo ?? 0;
  }
  return (
    <AdminShell tab="planners">
      <div className="adm-head">
        <div>
          <h1>Planners</h1>
          <p className="adm-sub">Everyone who runs events on DashPad, newest first.</p>
        </div>
      </div>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Events</th><th>Earned</th><th>Payout account</th><th>Joined</th></tr></thead>
            <tbody>
              {planners.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.email}</td>
                  <td className="num">{p.phone || '—'}</td>
                  <td className="num">{stats.get(p.id)?.events ?? 0}</td>
                  <td className="num">{naira(stats.get(p.id)?.earned ?? 0)}</td>
                  <td>{p.accountNumber ? `${p.bankName} · ${p.accountNumber}` : '—'}</td>
                  <td className="num">{new Date(p.createdAt).toLocaleDateString('en-NG')}</td>
                </tr>
              ))}
              {planners.length === 0 && <tr><td colSpan={7}>No planners yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
