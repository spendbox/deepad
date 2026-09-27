import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'DashPad' };

/**
 * Where the link in a test alert leads. Opening it is written to the admin's payment
 * log, so we can tell which banks' alerts had a link people could actually tap.
 * (Later this becomes the guest's own "wad" page.)
 */
export default async function AlertLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (clean) {
    await getStore()
      .logPayment({ source: 'check', paystackEvent: 'test_alert_opened', reference: clean, outcome: 'recorded', detail: `Test alert link ${clean} was opened.`, eventId: null })
      .catch(() => {});
  }
  return (
    <main className="container" style={{ maxWidth: 520, padding: '64px 20px', textAlign: 'center' }}>
      <h1 style={{ marginBottom: 12 }}>It works! 🎉</h1>
      <p>This page opened from the link in your bank alert. Soon this is where you’ll spray your wad.</p>
      <p className="hint">Link code: {clean || '—'}</p>
    </main>
  );
}
