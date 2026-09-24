import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStore } from '@/lib/store';
import SprayForm from './SprayForm';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getStore().getEventBySlug(slug);
  return { title: event ? `Spray ${event.celebrants} · DashPad` : 'DashPad' };
}

export default async function GuestSprayPage({ params }: Props) {
  const { slug } = await params;
  const event = await getStore().getEventBySlug(slug);
  if (!event) notFound();

  return (
    <main className="phone">
      <header className="phone-head">
        <div className="brand">DashPad</div>
        <h1>Spray {event.celebrants}</h1>
        <p>Your name and message show on the big screen as soon as your payment confirms.</p>
      </header>
      {event.status === 'ended' ? (
        <div className="phone-body">
          <div className="card">
            <strong>This event has ended.</strong>
            <span className="hint">Thank you for celebrating with {event.celebrants}!</span>
          </div>
        </div>
      ) : (
        <SprayForm
          slug={event.slug}
          fees={{ platformFeeBps: event.platformFeeBps, mcFeeBps: event.mcFeeBps }}
          celebrants={event.celebrants}
          direct={
            event.accountNumber
              ? { number: event.accountNumber, bank: event.accountBank, name: event.accountName }
              : null
          }
        />
      )}
    </main>
  );
}
