import Link from 'next/link';
import { eventPhase, formatWhen } from '@/lib/event-info';
import { summarise } from '@/lib/events';
import { naira, percent } from '@/lib/money';
import { requireAdmin } from '@/lib/session';
import { getStore } from '@/lib/store';
import PhasePill from '../dashboard/PhasePill';
import AdminShell from './AdminShell';
import PaymentLogTable from './PaymentLogTable';
import SetupCheck from './SetupCheck';
import TestAlert from './TestAlert';
import { getBalanceKobo, paystackConfigured, paystackIsLive } from '@/lib/paystack';
import { findSenderAccount } from '@/lib/sender-account';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · DashPad' };

export default async function AdminHome() {
  await requireAdmin();
  const store = getStore();
  const [planners, events, logs] = await Promise.all([store.listPlanners(), store.listEvents(), store.listPaymentLogs(40)]);
  const money = await store.listMoneyRows(events.map((e) => e.id));
  const balance = paystackConfigured() ? await getBalanceKobo().catch(() => null) : null;
  // The sender's account number in recent payment notifications: full, or partly hidden?
  const senderAccounts = logs
    .filter((l) => l.source === 'webhook' && l.raw)
    .map((l) => ({ when: new Date(l.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }), found: findSenderAccount(l.raw) }))
    .flatMap(({ when, found }) => (found ? [{ when, ...found }] : []))
    .slice(0, 5);
  const sums = events.map((e) => summarise(money.filter((m) => m.eventId === e.id)));
  const plannerName = new Map(planners.map((p) => [p.id, p.name]));
  const total = sums.reduce(
    (a, s) => ({ sprayed: a.sprayed + s.totalKobo, platform: a.platform + s.platformKobo, processing: a.processing + s.processingKobo, outside: a.outside + s.outside.length }),
    { sprayed: 0, platform: 0, processing: 0, outside: 0 },
  );

  return (
    <AdminShell>
      <h1>Overview</h1>
      <SetupCheck logs={logs} />
      <div className="tiles">
        <div className="tile gold"><div className="v">{naira(total.platform - total.processing)}</div><div className="k">DashPad earnings after Paystack fees</div></div>
        <div className="tile"><div className="v">{naira(total.platform)}</div><div className="k">DashPad 5% (before fees)</div></div>
        <div className="tile"><div className="v">{naira(total.processing)}</div><div className="k">Paystack fees paid by DashPad</div></div>
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
                  <td>{e.deletedAt ? <span className="pill ended">Deleted by planner</span> : <PhasePill phase={eventPhase(e)} />}</td>
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
        <h2>Test alert (₦1 with a link)</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Sends a small amount from DashPad’s Paystack balance with a message and a link in the description, to see how each
          bank shows it. Try accounts at the banks your guests use (GTBank, OPay, Moniepoint, Access, Kuda…) and check:
          does the whole message show, in the SMS and in the bank app? Can the link be tapped? Opened links show up in the
          payment log below as “Test alert link … was opened”.
        </p>
        <p className="hint">
          Paystack balance: <strong>{balance === null ? 'unknown' : naira(balance)}</strong>
          {!paystackIsLive() && ' · TEST key in use: nothing reaches real banks.'}
          {' '}· Each alert costs the amount plus Paystack’s transfer fee (about ₦10).
        </p>
        <TestAlert />
        <h3 style={{ marginTop: 24 }}>Does Paystack tell us who paid? (needed to send alerts back)</h3>
        {senderAccounts.length ? (
          <ul className="hint">
            {senderAccounts.map((a, i) => (
              <li key={i}>
                {a.when}: sender account <strong>{a.value}</strong> {a.full ? '✓ full number: alerts can be sent back' : '✗ partly hidden: alerts can’t be sent back'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No payment notification with a sender account number yet. Make one real transfer to an event’s account and check back.</p>
        )}
      </section>

      <PaymentLogTable logs={logs} />

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
