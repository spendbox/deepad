import { notFound } from 'next/navigation';
import { simulateAllowed } from '@/lib/config';
import { getStore } from '@/lib/store';
import { ANONYMOUS_NAME, intentState } from '@/lib/sprays';
import PayScreen from './PayScreen';

export const dynamic = 'force-dynamic';

export default async function PayPage({ params }: { params: Promise<{ slug: string; ref: string }> }) {
  const { slug, ref } = await params;
  const store = getStore();
  const [event, intent] = await Promise.all([store.getEventBySlug(slug), store.getIntent(ref)]);
  if (!event || !intent || intent.eventId !== event.id) notFound();

  return (
    <main className="phone">
      <header className="phone-head">
        <div className="brand">DashPad</div>
        <h1>Transfer to spray</h1>
        <p>Use your usual bank app. This account number is just for your spray.</p>
      </header>
      <PayScreen
        slug={slug}
        reference={intent.reference}
        initialState={intentState(intent)}
        totalKobo={intent.totalKobo}
        sprayKobo={intent.sprayKobo}
        feeKobo={intent.feeKobo}
        accountNumber={intent.accountNumber}
        bankName={intent.bankName}
        accountName={intent.accountName}
        expiresAt={intent.expiresAt}
        screenName={intent.anonymous ? ANONYMOUS_NAME : intent.guestName}
        message={intent.message}
        canSimulate={simulateAllowed()}
      />
    </main>
  );
}
