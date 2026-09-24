import { notFound } from 'next/navigation';
import { getStore } from '@/lib/store';
import { themeVars } from '../themeVars';
import PayScreen from './PayScreen';
import '../guest.css';

export const dynamic = 'force-dynamic';

export default async function PayPage({ params }: { params: Promise<{ slug: string; ref: string }> }) {
  const { slug, ref } = await params;
  const store = getStore();
  const [event, intent] = await Promise.all([store.getEventBySlug(slug), store.getIntent(ref)]);
  if (!event || !intent || intent.eventId !== event.id) notFound();

  return (
    <main className="g-page" style={themeVars(event.theme)}>
      <header>
        <div className="g-brand">DashPad</div>
        <h1 className="g-title">Transfer to spray</h1>
      </header>
      <PayScreen
        slug={event.slug}
        reference={intent.reference}
        paidAlready={intent.status === 'paid'}
        amountKobo={intent.amountKobo}
        message={intent.message}
        accountNumber={intent.accountNumber}
        bankName={intent.bankName}
        accountName={intent.accountName}
        expiresAt={intent.expiresAt}
      />
    </main>
  );
}
