import Logo from '@/components/Logo';
import Link from 'next/link';
import { paystackConfigured, paystackIsLive } from '@/lib/paystack';
import { emailConfigured } from '@/lib/email';
import { adminLogout } from '../actions';

/** DashPad staff area: a dark bar along the top (logo, sections, log out) and the page below. */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const warnings: string[] = [];
  if (!paystackConfigured()) warnings.push('Paystack is not connected (PAYSTACK_SECRET_KEY). Events cannot get account numbers.');
  else if (!paystackIsLive()) warnings.push('Paystack is in TEST mode: no real money moves.');
  if (!emailConfigured()) warnings.push('Email is not connected (RESEND_API_KEY, EMAIL_FROM). Planners won’t get their reports.');
  if (!process.env.CRON_SECRET) warnings.push('CRON_SECRET is not set, so the daily clean-up job cannot run.');

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-top-in">
          <Link href="/admin" className="adm-brand" aria-label="DashPad admin home">
            <Logo size={30} tone="dark" />
            <span className="adm-badge">Admin</span>
          </Link>
          <nav className="adm-nav" aria-label="Admin sections">
            <Link href="/admin#events">Events</Link>
            <Link href="/admin#payments">Payments</Link>
            <Link href="/admin#planners">Planners</Link>
            <Link href="/admin#setup">Setup</Link>
          </nav>
          <form action={adminLogout} className="adm-logout">
            <button type="submit" className="adm-logout-btn">Log out</button>
          </form>
        </div>
      </header>
      <main className="adm-main">
        {warnings.length > 0 && (
          <div className="banner warn adm-warn" role="status">
            <strong>Needs attention</strong>
            <ul>
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
