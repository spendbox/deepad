import Link from 'next/link';
import { logout } from '../actions';

export default function DashShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dash">
      <header className="dash-top">
        <Link href="/dashboard" className="brand">DashPad</Link>
        <nav aria-label="Account">
          <Link href="/dashboard">Events</Link>
          <Link href="/dashboard/profile">Profile</Link>
          <form action={logout}>
            <button type="submit">Log out</button>
          </form>
        </nav>
      </header>
      <main className="dash-main">{children}</main>
    </div>
  );
}
