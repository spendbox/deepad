import { LogoMark } from '@/components/Logo';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eventPhase } from '@/lib/event-info';
import { groupAccountNumber } from '@/lib/money';
import { getStore } from '@/lib/store';
import MessageSprayForm from './MessageSprayForm';
import { themeVars } from './themeVars';
import './guest.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getStore().getEventBySlug(slug);
  return { title: event ? `Spray ${event.celebrantName} · DashPad` : 'DashPad', robots: { index: false } };
}

// Opened from the QR code on the big screen: spray with a message.
export default async function MessageSprayPage({ params }: Props) {
  const { slug } = await params;
  const event = await getStore().getEventBySlug(slug);
  if (!event || event.deletedAt) notFound();
  const phase = eventPhase(event);
  const ready = phase === 'live' && event.setupStatus === 'ready';

  return (
    <main className="g-page" style={themeVars(event.theme)}>
      <header>
        <div className="g-brand"><LogoMark size={28} /></div>
        <h1 className="g-title">Spray {event.celebrantName} with a message</h1>
      </header>
      {ready ? (
        <>
          <p className="g-sub">
            Type your message, pick an amount, and we’ll give you an account number just for this spray. When your
            transfer lands, your message pops up on the big screen. You stay anonymous.
          </p>
          <MessageSprayForm slug={event.slug} />
          {event.accountNumber && (
            <p className="g-hint" style={{ textAlign: 'center' }}>
              No message? Transfer any amount to <strong>{groupAccountNumber(event.accountNumber)}</strong> ({event.accountBank}).
            </p>
          )}
        </>
      ) : (
        <div className="g-card">
          <strong>{phase === 'ended' ? 'Spraying has closed. Thank you!' : 'Spraying hasn’t opened yet.'}</strong>
          <Link href={`/${event.slug}`} className="g-link">Back to the event</Link>
        </div>
      )}
    </main>
  );
}
