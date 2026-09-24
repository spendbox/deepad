import Logo from '@/components/Logo';
import Link from 'next/link';
import { paystackConfigured, paystackIsLive } from '@/lib/paystack';
import { emailConfigured } from '@/lib/email';
import { adminLogout } from '../actions';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const warnings: string[] = [];
  if (!paystackConfigured()) warnings.push('Paystack is not connected (PAYSTACK_SECRET_KEY). Events cannot get account numbers.');
  else if (!paystackIsLive()) warnings.push('Paystack is in TEST mode: no real money moves.');
  if (!emailConfigured()) warnings.push('Email is not connected (RESEND_API_KEY, EMAIL_FROM). Planners won’t get their reports.');
  if (!process.env.CRON_SECRET) warnings.push('CRON_SECRET is not set, so the daily clean-up job cannot run.');

  return (
    <div className="dash">
      <header className="dash-top">
        <Link href="/admin" className="brand" aria-label="DashPad admin"><Logo size={28} /> <span style={{ color: 'var(--lilac)', fontSize: 15, marginLeft: 6 }}>admin</span></Link>
        <nav>
          <form action={adminLogout}>
            <button type="submit" className="btn btn-sm" style={{ background: "transparent", color: "var(--ivory)", borderColor: "var(--ivory)" }}>Log out</button>
          </form>
        </nav>
      </header>
      <main className="dash-main" style={{ maxWidth: 1100 }}>
        {warnings.map((w) => <div key={w} className="banner warn">{w}</div>)}
        {children}
      </main>
    </div>
  );
}
