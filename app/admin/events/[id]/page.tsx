import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { simulateAllowed, siteUrl } from '@/lib/config';
import { groupAccountNumber, naira, percent } from '@/lib/money';
import { getStore } from '@/lib/store';
import { saveEvent, setHidden, setNextUp, setPaused, setStatus, simulateDirectTransfer } from '../../actions';
import AdminShell from '../../AdminShell';
import EventForm from '../../EventForm';
import AutoRefresh from './AutoRefresh';
import SimulateForm from './SimulateForm';

export const dynamic = 'force-dynamic';

export default async function EventAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const event = await store.getEventById(id);
  if (!event) notFound();

  const sprays = await store.listSprays(event.id, 1000);
  const stats = await store.eventStats(event.id);
  const totals = sprays.reduce(
    (t, s) => ({
      platform: t.platform + s.platformFeeKobo,
      mc: t.mc + s.mcFeeKobo,
      celebrant: t.celebrant + s.celebrantKobo,
    }),
    { platform: 0, mc: 0, celebrant: 0 },
  );

  const base = await siteUrl();
  const guestUrl = `${base}/s/${event.slug}`;
  const screenUrl = `/screen/${event.slug}`;
  const qrPng = await QRCode.toDataURL(guestUrl, { width: 600, margin: 2, color: { dark: '#1F0A26', light: '#FFFFFF' } });

  return (
    <AdminShell>
      <AutoRefresh seconds={5} />
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>{event.title}</h1>
          <div className="hint">
            MC: {event.mcName || '—'} · Fees: DashPad {percent(event.platformFeeBps)} + MC {percent(event.mcFeeBps)}
          </div>
        </div>
        <span className={`pill ${event.status}`} style={{ fontSize: 14 }}>{event.status}</span>
      </div>

      <div className="panel">
        <h2>Run the event</h2>
        <div className="actions">
          <a href={screenUrl} target="_blank" rel="noreferrer" className="btn dark">Open big screen ↗</a>
          <a href={`/s/${event.slug}`} target="_blank" rel="noreferrer" className="btn">Open guest page ↗</a>
          <a href={qrPng} download={`dashpad-${event.slug}-qr.png`} className="btn">Download QR code</a>
        </div>
        <div className="hint">Guest link: {guestUrl}</div>
        <div className="actions">
          {(['draft', 'live', 'ended'] as const).map((s) => (
            <form key={s} action={setStatus.bind(null, event.id, s)}>
              <button type="submit" className={`btn small${event.status === s ? ' dark' : ''}`} aria-pressed={event.status === s}>
                {s === 'draft' ? 'Draft' : s === 'live' ? 'Live' : 'Ended'}
              </button>
            </form>
          ))}
          <form action={setPaused.bind(null, event.id, !event.paused)}>
            <button type="submit" className="btn small">{event.paused ? 'Resume screen' : 'Pause screen'}</button>
          </form>
        </div>
        <span className="hint">
          Pause shows only the account number and QR code (e.g. during prayers or speeches). Payments still come
          in and pop up when you resume.
        </span>
        <form action={setNextUp.bind(null, event.id)} className="actions">
          <input name="nextUp" className="input" style={{ flex: '1 1 240px' }} defaultValue={event.nextUp ?? ''} placeholder="Coming up next, e.g. Couple trivia" aria-label="Coming up next" />
          <button type="submit" className="btn small">Update</button>
        </form>
        {event.accountNumber && (
          <div className="hint">
            Event account on screen: <strong className="tabular">{groupAccountNumber(event.accountNumber)}</strong>{' '}
            {event.accountBank}
          </div>
        )}
      </div>

      <div className="stat-tiles">
        <div className="tile gold"><div className="v">{naira(stats.totalKobo)}</div><div className="k">Total sprayed</div></div>
        <div className="tile"><div className="v">{stats.count}</div><div className="k">Sprays</div></div>
        <div className="tile"><div className="v">{naira(totals.celebrant)}</div><div className="k">Celebrant receives</div></div>
        <div className="tile"><div className="v">{naira(totals.mc)}</div><div className="k">MC earnings</div></div>
        <div className="tile"><div className="v">{naira(totals.platform)}</div><div className="k">DashPad fees</div></div>
      </div>

      {simulateAllowed() && (
        <div className="panel">
          <h2>Test payments</h2>
          <span className="hint">
            Pretend someone transferred straight to the event account from their bank app. To test the QR way, open
            the guest page and use the “pretend I’ve paid” button.
          </span>
          <SimulateForm action={simulateDirectTransfer.bind(null, event.id)} />
        </div>
      )}

      <div className="panel">
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <h2>Sprays (private report)</h2>
          <a className="btn small" href={`/admin/events/${event.id}/report`}>Download report (CSV)</a>
        </div>
        <span className="hint">Real names are shown here, including anonymous guests. Only you and the celebrant should see this.</span>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>On screen as</th>
                <th>Real name</th>
                <th>Amount</th>
                <th>Message</th>
                <th>Way</th>
                <th>Screen</th>
              </tr>
            </thead>
            <tbody>
              {sprays.map((s) => (
                <tr key={s.id}>
                  <td className="num">{new Date(s.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })}</td>
                  <td>{s.displayName}</td>
                  <td>{s.guestName}</td>
                  <td className="num"><strong>{naira(s.amountKobo)}</strong></td>
                  <td style={{ opacity: s.hidden ? 0.5 : 1, textDecoration: s.hidden ? 'line-through' : 'none' }}>{s.message ?? '—'}</td>
                  <td>{s.source === 'qr' ? 'QR' : 'Transfer'}</td>
                  <td>
                    {s.message ? (
                      <form action={setHidden.bind(null, event.id, s.id, !s.hidden)}>
                        <button type="submit" className="btn small">{s.hidden ? 'Show message' : 'Hide message'}</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
              {sprays.length === 0 && (
                <tr><td colSpan={7}>No sprays yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2>Event settings</h2>
      <EventForm action={saveEvent.bind(null, event.id)} event={event} submitLabel="Save settings" />
      <p><Link href="/admin">← All events</Link></p>
    </AdminShell>
  );
}
