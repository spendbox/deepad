import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eventPhase, formatWhen } from '@/lib/event-info';
import { summarise } from '@/lib/events';
import { naira, percent } from '@/lib/money';
import { requireAdmin } from '@/lib/session';
import { getStore } from '@/lib/store';
import { adminRetrySetup } from '../../../actions';
import PhasePill from '../../../dashboard/PhasePill';
import AdminShell from '../../AdminShell';
import PaymentLogTable from '../../PaymentLogTable';
import CheckPaystackButton from './CheckPaystackButton';

export const dynamic = 'force-dynamic';

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const store = getStore();
  const event = await store.getEventById(id);
  if (!event) notFound();
  const [planner, transfers, allLogs] = await Promise.all([
    store.getPlannerById(event.plannerId),
    store.listTransfers(event.id, 100000),
    store.listPaymentLogs(300),
  ]);
  const logs = allLogs.filter((l) => l.eventId === event.id).slice(0, 40);
  const s = summarise(transfers);

  return (
    <AdminShell>
      <div className="row-between">
        <h1>{event.title}</h1>
        <PhasePill phase={eventPhase(event)} />
      </div>
      <div className="card">
        <span>Planner: <strong>{planner?.name}</strong> ({planner?.email}, {planner?.phone})</span>
        <span>When: {formatWhen(event.startsAt)} → {formatWhen(event.endsAt)}</span>
        <span>Link: <a href={`/${event.slug}`} target="_blank" rel="noreferrer">/{event.slug}</a></span>
        <span>Payout: {event.payoutAccountName} · {event.payoutBankName} · {event.payoutAccountNumber}</span>
        <span>Fees: DashPad {percent(event.platformFeeBps)} · planner {percent(event.plannerFeeBps)}</span>
        <span>
          Event account: {event.accountNumber ? `${event.accountNumber} (${event.accountBank})` : '—'} · setup{' '}
          <strong>{event.setupStatus}</strong>
          {event.setupError ? `: ${event.setupError}` : ''}
        </span>
        {event.setupStatus !== 'ready' && (
          <form action={adminRetrySetup.bind(null, event.id)}>
            <button type="submit" className="btn btn-dark btn-sm">Retry payment setup</button>
          </form>
        )}
        {event.deletedAt && <span className="pill ended" style={{ alignSelf: 'flex-start' }}>Deleted by planner on {new Date(event.deletedAt).toLocaleString('en-NG')}</span>}
        {event.setupStatus === 'ready' && <CheckPaystackButton eventId={event.id} />}
        <span>Report emailed: {event.reportSentAt ? new Date(event.reportSentAt).toLocaleString('en-NG') : 'not yet'}</span>
      </div>
      <div className="tiles">
        <div className="tile gold"><div className="v">{naira(s.platformKobo - s.processingKobo)}</div><div className="k">DashPad earnings after fees</div></div>
        <div className="tile"><div className="v">{naira(s.processingKobo)}</div><div className="k">Paystack fees</div></div>
        <div className="tile"><div className="v">{naira(s.totalKobo)}</div><div className="k">Sprayed ({s.count})</div></div>
        <div className="tile"><div className="v">{naira(s.plannerKobo)}</div><div className="k">Planner cut</div></div>
        <div className="tile"><div className="v">{naira(s.celebrantKobo)}</div><div className="k">Celebrant</div></div>
      </div>
      <section className="card">
        <h2>Transfers</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Sender</th><th>Bank</th><th>Amount</th><th>Message</th><th>Note</th><th>Reference</th></tr></thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td className="num">{new Date(t.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</td>
                  <td>{t.senderName ?? '—'}</td>
                  <td>{t.senderBank ?? '—'}</td>
                  <td className="num"><strong>{naira(t.amountKobo)}</strong></td>
                  <td>{t.message ?? '—'}{t.hidden ? ' (hidden)' : ''}</td>
                  <td>{t.outsideWindow ? <span className="pill failed">Outside event time: needs refund</span> : ''}</td>
                  <td className="num">{t.reference}</td>
                </tr>
              ))}
              {transfers.length === 0 && <tr><td colSpan={7}>No transfers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <PaymentLogTable logs={logs} title="Payment notifications for this event" />
      <p><Link href="/admin">← Overview</Link></p>
    </AdminShell>
  );
}
