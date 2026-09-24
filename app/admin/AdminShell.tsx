import Link from 'next/link';
import { paymentMode, storeIsPractice } from '@/lib/config';
import { logout } from './actions';

const MODE_TEXT = {
  demo: 'Demo mode: no real payments. Use the "pretend" buttons to test.',
  'paystack-test': 'Paystack TEST mode: real Paystack system, fake money.',
  'paystack-live': 'LIVE: real money is moving.',
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const mode = paymentMode();
  return (
    <div className="admin">
      <header className="admin-top">
        <Link href="/admin" className="brand" style={{ textDecoration: 'none' }}>DashPad admin</Link>
        <nav>
          <Link href="/admin">Events</Link>
          <Link href="/admin/events/new">New event</Link>
          <form action={logout}>
            <button type="submit">Log out</button>
          </form>
        </nav>
      </header>
      <main className="admin-main">
        {storeIsPractice() && (
          <div className="banner warn">
            <strong>Practice database.</strong> Supabase is not connected yet, so events and sprays are kept in
            memory and disappear when the server restarts. Fine for trying things out; never use it for a real event.
          </div>
        )}
        <div className={`banner ${mode === 'paystack-live' ? 'warn' : 'info'}`}>{MODE_TEXT[mode]}</div>
        {children}
      </main>
    </div>
  );
}
