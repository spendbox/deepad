import Logo from '@/components/Logo';
import Link from 'next/link';
import { paystackConfigured, paystackIsLive } from '@/lib/paystack';
import { emailConfigured } from '@/lib/email';
import { adminLogout } from '../actions';

export type AdminTab = 'overview' | 'events' | 'payments' | 'planners' | 'setup';

const TABS: { id: AdminTab; label: string; href: string }[] = [
  { id: 'overview', label: 'Overview', href: '/admin' },
  { id: 'events', label: 'Events', href: '/admin/events' },
  { id: 'payments', label: 'Payments', href: '/admin/payments' },
  { id: 'planners', label: 'Planners', href: '/admin/planners' },
  { id: 'setup', label: 'Setup', href: '/admin/setup' },
];

/** DashPad staff area: a dark bar along the top (logo, tabs, log out) and the page below. */
export default function AdminShell({ tab, children }: { tab: AdminTab; children: React.ReactNode }) {
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
            {TABS.map((t) => (
              <Link key={t.id} href={t.href} aria-current={t.id === tab ? 'page' : undefined}>{t.label}</Link>
            ))}
          </nav>
          <form action={adminLogout} className="adm-logout">
            <button type="submit" className="adm-logout-btn">Log out</button>
          </form>
        </div>
      </header>
      <main className="adm-main">
        {/* On every tab except Setup, which lists everything in full. */}
        {warnings.length > 0 && tab !== 'setup' && (
          <div className="banner warn adm-warn" role="status">
            <div className="row-between">
              <strong>Needs attention</strong>
              <Link href="/admin/setup" className="adm-see-all">Open Setup →</Link>
            </div>
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
