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
import CheckPaystackButton, { RecleanButton } from './CheckPaystackButton';

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
    <AdminShell tab="events">
      <p style={{ margin: 0 }}><Link href="/admin/events">← All events</Link></p>
      <div className="adm-head">
        <h1>{event.title}</h1>
        <PhasePill phase={eventPhase(event)} />
      </div>
      <div className="card">
        <dl className="adm-facts">
          <dt>Planner</dt>
          <dd><strong>{planner?.name}</strong> · {planner?.email} · {planner?.phone}</dd>
          <dt>When</dt>
          <dd>{formatWhen(event.startsAt)} → {formatWhen(event.endsAt)}</dd>
          <dt>Link</dt>
          <dd><a href={`/${event.slug}`} target="_blank" rel="noreferrer">/{event.slug}</a></dd>
          <dt>Event account</dt>
          <dd>
            {event.accountNumber ? <><strong>{event.accountNumber}</strong> · {event.accountBank}</> : '—'}{' '}
            <span className={`pill ${event.setupStatus === 'ready' ? 'live' : event.setupStatus === 'failed' ? 'failed' : ''}`}>setup {event.setupStatus}</span>
            {event.setupError ? ` ${event.setupError}` : ''}
          </dd>
          <dt>Celebrant payout</dt>
          <dd>{event.payoutAccountName} · {event.payoutBankName} · {event.payoutAccountNumber}</dd>
          <dt>Fees</dt>
          <dd>DashPad {percent(event.platformFeeBps)} · planner {percent(event.plannerFeeBps)}</dd>
          <dt>Report emailed</dt>
          <dd>{event.reportSentAt ? new Date(event.reportSentAt).toLocaleString('en-NG') : 'Not yet'}</dd>
        </dl>
        {event.setupStatus !== 'ready' && (
          <form action={adminRetrySetup.bind(null, event.id)}>
            <button type="submit" className="btn btn-dark btn-sm">Retry payment setup</button>
          </form>
        )}
        {event.deletedAt && <span className="pill ended" style={{ alignSelf: 'flex-start' }}>Deleted by planner on {new Date(event.deletedAt).toLocaleString('en-NG')}</span>}
        {event.setupStatus === 'ready' && <CheckPaystackButton eventId={event.id} />}
      </div>
      <div className="tiles">
        <div className="tile gold"><div className="v">{naira(s.platformKobo - s.processingKobo)}</div><div className="k">DashPad earnings after fees</div></div>
        <div className="tile"><div className="v">{naira(s.processingKobo)}</div><div className="k">Paystack fees</div></div>
        <div className="tile"><div className="v">{naira(s.totalKobo)}</div><div className="k">Sprayed ({s.count})</div></div>
        <div className="tile"><div className="v">{naira(s.plannerKobo)}</div><div className="k">Planner cut</div></div>
        <div className="tile"><div className="v">{naira(s.celebrantKobo)}</div><div className="k">Celebrant</div></div>
      </div>
      <section className="card">
        <div className="row-between">
          <h2>Transfers</h2>
          <div className="actions">
            <a href={`/admin/events/${event.id}/report`} className="btn btn-sm">PDF report</a>
            <RecleanButton eventId={event.id} />
          </div>
        </div>
        <span className="hint">“Re-check all messages” re-reads every bank description with the latest rules (for example, removing the account’s own name).</span>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Sender</th><th>Bank</th><th>Amount</th><th>On screen</th><th>Bank description (raw)</th><th>Note</th><th>Reference</th></tr></thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td className="num">{new Date(t.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</td>
                  <td>{t.senderName ?? '—'}</td>
                  <td>{t.senderBank ?? '—'}</td>
                  <td className="num"><strong>{naira(t.amountKobo)}</strong></td>
                  <td>{t.message ?? '—'}{t.hidden ? ' (hidden)' : ''}</td>
                  <td>{t.rawNarration ?? '—'}</td>
                  <td>{t.outsideWindow ? <span className="pill failed">Outside event time: needs refund</span> : ''}</td>
                  <td className="num">{t.reference}</td>
                </tr>
              ))}
              {transfers.length === 0 && <tr><td colSpan={8}>No transfers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <PaymentLogTable logs={logs} title="Payment notifications for this event" />
      <p><Link href="/admin/events">← All events</Link></p>
    </AdminShell>
  );
}
