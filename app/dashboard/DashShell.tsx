import Link from 'next/link';
import Logo from '@/components/Logo';
import DashNav from './DashNav';

/** Planner area: a sidebar on laptops, a top bar with a menu button on phones. */
export default function DashShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dash">
      <DashNav
        logo={
          <Link href="/dashboard" className="brand" aria-label="DashPad dashboard">
            <Logo size={30} />
          </Link>
        }
      />
      <main className="dash-main">{children}</main>
    </div>
  );
}
