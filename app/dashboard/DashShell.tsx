import Link from 'next/link';
import DashNav from './DashNav';

export default function DashShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dash">
      <header className="dash-top">
        <Link href="/dashboard" className="brand">DashPad</Link>
        <DashNav />
      </header>
      <main className="dash-main">{children}</main>
    </div>
  );
}
