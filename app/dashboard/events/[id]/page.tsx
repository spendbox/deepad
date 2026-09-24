import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import CopyButton from '@/components/CopyButton';
import PayoutNote from '@/components/PayoutNote';
import { eventPhase, formatWhen } from '@/lib/event-info';
import { checkPaystackForTransfers, closeEvent, summarise } from '@/lib/events';
import { groupAccountNumber, naira, percent } from '@/lib/money';
import { requirePlanner } from '@/lib/session';
import { siteUrl } from '@/lib/site';
import { getStore } from '@/lib/store';
import { retrySetup, setPaused, setTransferHidden } from '../../../actions';
import AutoRefresh from '../../AutoRefresh';
import AllSpraysDialog from './AllSpraysDialog';
import DeleteEvent from './DeleteEvent';
import EventPhotos from './EventPhotos';
import DashShell from '../../DashShell';
import PhasePill from '../../PhasePill';
import ReportButton from './ReportButton';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const planner = await requirePlanner();
  const store = getStore();
  const event = await store.getEventById(id);
  if (!event || event.plannerId !== planner.id || event.deletedAt) notFound();

  // Backup for missed payment notifications while the planner is watching.
  after(() => checkPaystackForTransfers(event).catch((err) => console.error('checkPaystack failed', err)));

  const phase = eventPhase(event);
  if (phase === 'ended' && (!event.closedAt || !event.reportSentAt)) {
    after(() => closeEvent(event).catch((err) => console.error('closeEvent failed', err)));
  }

  const transfers = await store.listTransfers(event.id, 1000);
  const s = summarise(transfers);
  const link = `${await siteUrl()}/${event.slug}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${event.title}: spray here ${link}`)}`;
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });

  const sprayRow = (t: (typeof transfers)[number]) => (
    <div key={t.id} className="feed-item">
      <div style={{ minWidth: 0 }}>
        <div className="who">{t.senderName ?? 'Unknown sender'}</div>
        <div className="hint">
          {time(t.createdAt)}
          {t.senderBank ? ` · ${t.senderBank}` : ''}
          {t.outsideWindow ? ' · outside event time, not shown' : ''}
        </div>
        {t.message ? (
          <div className={`msg${t.hidden ? ' hidden-msg' : ''}`}>“{t.message}”</div>
        ) : (
          <div className="msg">{t.rawNarration ? 'No message after removing bank codes' : 'No description typed'}</div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span className="amt">{naira(t.amountKobo)}</span>
        {t.message && !t.outsideWindow && (
          <form action={setTransferHidden.bind(null, event.id, t.id, !t.hidden)}>
            <button type="submit" className="btn btn-sm">{t.hidden ? 'Show message' : 'Hide message'}</button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <DashShell>
      <AutoRefresh seconds={6} />
      {created === '1' && (
        <div className="banner info" role="status">
          <strong>Your event is ready.</strong> Share the link below and open it on the big screen at the party.
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <div className="row-between">
          <h1>{event.title}</h1>
          <PhasePill phase={phase} />
        </div>
        <span className="hint">
          {formatWhen(event.startsAt)} → {formatWhen(event.endsAt)} · Your cut {percent(event.plannerFeeBps)}
        </span>
      </div>

      <section className="share-box" aria-label="Your event link">
        <span style={{ color: 'var(--lilac)', fontSize: 14 }}>Your event link: open it on the big screen</span>
        <span className="share-link">{link}</span>
        <div className="actions">
          <CopyButton text={link} label="Copy link" dark />
          <a href={whatsapp} target="_blank" rel="noreferrer" className="btn btn-gold btn-sm">Share on WhatsApp</a>
          <a href={`/${event.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: 'transparent', color: 'var(--ivory)', borderColor: 'var(--ivory)' }}>
            Open big screen ↗
          </a>
        </div>
      </section>

      <section className="card" aria-label="Event account number">
        <span className="hint">Guests transfer to</span>
        {event.setupStatus === 'ready' && event.accountNumber ? (
          <>
            <div className="row-between">
              <span className="acct-big">{groupAccountNumber(event.accountNumber)}</span>
              <CopyButton text={event.accountNumber} />
            </div>
            <span className="bank-strong">{event.accountBank}</span>
            <span style={{ fontWeight: 600 }}>{event.accountName}</span>
            {phase === 'ended' && <span className="hint">This account is closed. New transfers are not accepted.</span>}
          </>
        ) : event.setupStatus === 'failed' ? (
          <>
            <div className="banner error">
              We couldn’t create the account number yet: {event.setupError ?? 'unknown error'}
            </div>
            <form action={retrySetup.bind(null, event.id)}>
              <button type="submit" className="btn btn-dark">Try again</button>
            </form>
          </>
        ) : (
          <div className="banner warn">{event.setupError ?? 'Your account number is being set up. Check back in a moment.'}</div>
        )}
        <span className="hint">
          Money goes to {event.payoutAccountName} ({event.payoutBankName} · {event.payoutAccountNumber}).
        </span>
        <PayoutNote />
      </section>

      <div className="tiles">
        <div className="tile gold"><div className="v">{naira(s.totalKobo)}</div><div className="k">Sprayed</div></div>
        <div className="tile"><div className="v">{s.count}</div><div className="k">Sprays</div></div>
        <div className="tile"><div className="v">{naira(s.plannerKobo)}</div><div className="k">You earn</div></div>
        <div className="tile"><div className="v">{naira(s.celebrantKobo)}</div><div className="k">{event.celebrantName} gets</div></div>
      </div>

      {phase !== 'ended' && (
        <section className="card">
          <div className="row-between">
            <div>
              <h2>Big screen</h2>
              <span className="hint">
                {event.paused
                  ? 'Paused: sprays wait in line and show when you resume.'
                  : 'Showing sprays as they arrive.'}
              </span>
            </div>
            <form action={setPaused.bind(null, event.id, !event.paused)}>
              <button type="submit" className={`btn ${event.paused ? 'btn-dark' : ''}`}>
                {event.paused ? 'Resume' : 'Pause for speeches'}
              </button>
            </form>
          </div>
        </section>
      )}

      <section className="card">
        <div className="row-between">
          <div>
            <h2>Who sprayed</h2>
            <span className="hint">Private: the screen never shows names</span>
          </div>
          <a href={`/dashboard/events/${event.id}/report`} className="btn btn-sm">Download PDF report</a>
        </div>
        {transfers.length === 0 ? (
          <p className="empty">No sprays yet. They’ll appear here the moment they land (it can take up to a minute).</p>
        ) : (
          <>
            <div className="feed">{transfers.slice(0, 10).map(sprayRow)}</div>
            {transfers.length > 10 && (
              <AllSpraysDialog count={transfers.length}>
                <div className="feed">{transfers.map(sprayRow)}</div>
              </AllSpraysDialog>
            )}
          </>
        )}
      </section>

      {phase === 'ended' && (
        <section className="card">
          <h2>Event report</h2>
          <span className="hint">
            {event.reportSentAt
              ? `Emailed to ${planner.email}.`
              : `We’ll email the full list of who sprayed to ${planner.email}.`}
          </span>
          <ReportButton eventId={event.id} />
        </section>
      )}

      <details className="card">
        <summary>Celebrant photos ({event.photos.length})</summary>
        <EventPhotos eventId={event.id} initial={event.photos} />
      </details>

      <details className="card">
        <summary>Event settings</summary>
        <SettingsForm
          eventId={event.id}
          ended={phase === 'ended'}
          values={{
            slug: event.slug,
            hypeLines: event.hypeLines ?? [],
            title: event.title,
            recipientLabel: event.recipientLabel,
            theme: event.theme,
            bigSprayNaira: event.bigSprayKobo / 100,
            endsAt: event.endsAt,
          }}
        />
      </details>

      <details className="card">
        <summary>Delete event</summary>
        <DeleteEvent eventId={event.id} hasMoney={transfers.length > 0} live={phase === 'live'} />
      </details>

      <p><Link href="/dashboard">← All events</Link></p>
    </DashShell>
  );
}
