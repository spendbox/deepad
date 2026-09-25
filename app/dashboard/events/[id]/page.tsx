import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import CopyButton from '@/components/CopyButton';
import PayoutNote from '@/components/PayoutNote';
import { eventTimeline } from '@/lib/earnings';
import { eventPhase, formatWhen } from '@/lib/event-info';
import { checkPaystackForTransfers, closeEvent, summarise } from '@/lib/events';
import { groupAccountNumber, naira, percent } from '@/lib/money';
import { cutoutsConfigured } from '@/lib/cutouts';
import { requirePlanner } from '@/lib/session';
import { siteUrl } from '@/lib/site';
import { getStore } from '@/lib/store';
import { retrySetup } from '../../../actions';
import AutoRefresh from '../../AutoRefresh';
import EarningsChart from '../../earnings/EarningsChart';
import AllSpraysDialog from './AllSpraysDialog';
import DeleteEvent from './DeleteEvent';
import EventPhotos from './EventPhotos';
import DashShell from '../../DashShell';
import PhasePill from '../../PhasePill';
import ReportButton from './ReportButton';
import LinesCard from './LinesCard';
import EventTabs from './EventTabs';
import PauseToggle from './PauseToggle';
import SplitDialog from './SplitDialog';
import SectionCard from '@/components/SectionCard';
import { DetailsForm, LinkForm, ThemeForm } from './SettingsForm';

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

  const [transfers, lines] = await Promise.all([store.listTransfers(event.id, 1000), store.listLines(event.id, { limit: 1000 })]);
  const s = summarise(transfers);
  const timeline = eventTimeline(
    transfers.filter((t) => !t.outsideWindow).map((t) => ({ at: new Date(t.createdAt).getTime(), kobo: t.plannerFeeKobo })),
    new Date(event.startsAt).getTime(),
    new Date(event.endsAt).getTime(),
    Date.now(),
  );
  const link = `${await siteUrl()}/${event.slug}`;
  const canRemoveBg = cutoutsConfigured();
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
        {/* The bank description: only you see it (the big screen shows lines instead). */}
        {t.message && <div className="msg">“{t.message}”</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span className="amt">{naira(t.amountKobo)}</span>
      </div>
    </div>
  );

  return (
    <DashShell>
      {/* Live: fresh numbers every few seconds. Otherwise only now and then. */}
      {phase !== 'ended' && <AutoRefresh seconds={phase === 'live' ? 6 : 30} />}
      {created === '1' && (
        <div className="banner info" role="status">
          <strong>Your event is ready.</strong> Share the link below and open it on the big screen at the party.
        </div>
      )}

      <header className="ev-hero">
        <div className="ev-hero-text">
          <div className="ev-hero-top">
            <PhasePill phase={phase} />
            <span className="hint">{formatWhen(event.startsAt)} → {formatWhen(event.endsAt)}</span>
          </div>
          <h1>{event.title}</h1>
        </div>
        {phase !== 'ended' && <PauseToggle eventId={event.id} paused={event.paused} />}
      </header>

      <EventTabs
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            content: (
              <>
                <section className="share-box" aria-label="Your event link">
                  <span style={{ color: 'var(--lilac)', fontSize: 14 }}>Your event link: open it on the big screen</span>
                  <span className="share-link">{link}</span>
                  <div className="actions">
                    <CopyButton text={link} label="Copy link" dark />
                    <a href={whatsapp} target="_blank" rel="noreferrer" className="btn btn-gold btn-sm">Share on WhatsApp</a>
                    <a href={`/${event.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost-light">Open big screen ↗</a>
                  </div>
                </section>

                <SectionCard icon="money" title="Guests transfer to" action={
                  <SplitDialog
                    plannerFeeBps={event.plannerFeeBps}
                    platformFeeBps={event.platformFeeBps}
                    celebrantName={event.celebrantName}
                    celebrantAccount={`${event.payoutAccountName} · ${event.payoutBankName} · ${event.payoutAccountNumber}`}
                    plannerAccount={planner.accountNumber ? `${planner.accountName ?? planner.name} · ${planner.bankName ?? ''} · ${planner.accountNumber}` : null}
                  />
                }>
                  {event.setupStatus === 'ready' && event.accountNumber ? (
                    <div className="acct-box">
                      <div className="row-between">
                        <span className="acct-big">{groupAccountNumber(event.accountNumber)}</span>
                        <CopyButton text={event.accountNumber} />
                      </div>
                      <span className="bank-strong">{event.accountBank}</span>
                      <span style={{ fontWeight: 600 }}>{event.accountName}</span>
                      {phase === 'ended' && <span className="hint">This account is closed. New transfers are not accepted.</span>}
                    </div>
                  ) : event.setupStatus === 'failed' ? (
                    <>
                      <div className="banner error">We couldn’t create the account number yet: {event.setupError ?? 'unknown error'}</div>
                      <form action={retrySetup.bind(null, event.id)}>
                        <button type="submit" className="btn btn-dark">Try again</button>
                      </form>
                    </>
                  ) : (
                    <div className="banner warn">{event.setupError ?? 'Your account number is being set up. Check back in a moment.'}</div>
                  )}
                  <PayoutNote />
                </SectionCard>

                <div className="tiles">
                  <div className="tile gold"><div className="v">{naira(s.totalKobo)}</div><div className="k">Sprayed</div></div>
                  <div className="tile"><div className="v">{s.count}</div><div className="k">Sprays</div></div>
                  <div className="tile"><div className="v">{naira(s.plannerKobo)}</div><div className="k">You earn ({percent(event.plannerFeeBps)})</div></div>
                  <div className="tile"><div className="v">{naira(s.celebrantKobo)}</div><div className="k">{event.celebrantName} gets</div></div>
                </div>

                {phase !== 'upcoming' && timeline.buckets.length > 1 && event.plannerFeeBps > 0 && (
                  <EarningsChart
                    bars={timeline.buckets.map((b) => ({ label: b.label, tip: b.tip, kobo: b.kobo, sprays: b.sprays }))}
                    title="Your earnings through the event"
                    per={timeline.slotLabel === 'hour' ? 'hour' : `${timeline.slotLabel.split(' ')[0]} min`}
                  />
                )}

                <SectionCard
                  icon="people"
                  title="Who sprayed"
                  hint="The big screen shows only first names and initials, never amounts."
                  action={<a href={`/dashboard/events/${event.id}/report`} className="btn btn-sm">PDF report</a>}
                >
                  {transfers.length === 0 ? (
                    <p className="empty" style={{ margin: 0 }}>No sprays yet. They’ll appear here the moment they land (it can take up to a minute).</p>
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
                </SectionCard>

                {phase === 'ended' && (
                  <SectionCard
                    icon="report"
                    title="Event report"
                    hint={event.reportSentAt ? `Emailed to ${planner.email}.` : `We’ll email the full list of who sprayed to ${planner.email}.`}
                  >
                    <ReportButton eventId={event.id} />
                  </SectionCard>
                )}
              </>
            ),
          },
          {
            id: 'lines',
            label: 'Lines',
            badge: lines.filter((l) => l.status === 'pending').length,
            content: (
              <LinesCard
                eventId={event.id}
                initialLines={lines}
                writeLink={`${link}/write`}
                plannerName={planner.name}
                celebrantName={event.celebrantName}
                ended={phase === 'ended'}
              />
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <>
                <SectionCard
                  icon="photo"
                  title="Celebrant photos"
                  hint={canRemoveBg ? 'With the background removed, they stand on the big screen and the confetti lands on them.' : 'They show on the big screen.'}
                >
                  <EventPhotos eventId={event.id} initial={event.photos} canRemoveBg={canRemoveBg} />
                </SectionCard>

                <SectionCard icon="details" title="Event details" hint="What the big screen says, and when spraying closes.">
                  <DetailsForm
                    eventId={event.id}
                    ended={phase === 'ended'}
                    values={{
                      slug: event.slug,
                      title: event.title,
                      recipientLabel: event.recipientLabel,
                      theme: event.theme,
                      themeColors: event.themeColors ?? null,
                      bigSprayNaira: event.bigSprayKobo / 100,
                      endsAt: event.endsAt,
                    }}
                  />
                </SectionCard>

                <SectionCard icon="palette" title="Screen colours" hint="Pick a theme or your own colours. We keep the text easy to read.">
                  <ThemeForm eventId={event.id} values={{ theme: event.theme, themeColors: event.themeColors ?? null, recipientLabel: event.recipientLabel }} />
                </SectionCard>

                <SectionCard icon="link" title="Event link" hint="The address you share and open on the big screen.">
                  <LinkForm eventId={event.id} slug={event.slug} link={link} canChange={phase === 'upcoming'} />
                </SectionCard>

                <SectionCard icon="trash" title="Delete event" tone="danger" hint="Remove this event from your dashboard.">
                  <DeleteEvent eventId={event.id} hasMoney={transfers.length > 0} live={phase === 'live'} />
                </SectionCard>
              </>
            ),
          },
        ]}
      />

      <p><Link href="/dashboard">← All events</Link></p>
    </DashShell>
  );
}
