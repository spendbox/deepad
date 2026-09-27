'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HamburgerIcon, useMobileMenu } from '@/components/useMobileMenu';
import { logout } from '../actions';

const icons = {
  events: <path d="M4 7h16M4 12h16M4 17h10" />,
  earnings: <path d="M4 19V11M10 19V5M16 19v-6M22 19H2" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

const LINKS = [
  { href: '/dashboard', label: 'My events', icon: 'events' as const },
  { href: '/dashboard/earnings', label: 'Earnings', icon: 'earnings' as const },
  { href: '/dashboard/profile', label: 'Profile & payouts', icon: 'profile' as const },
];

export default function DashNav({ logo }: { logo: React.ReactNode }) {
  const menu = useMobileMenu();
  const path = usePathname();

  const isActive = (href: string) =>
    href === '/dashboard' ? path === '/dashboard' || path.startsWith('/dashboard/events') : path.startsWith(href);

  return (
    <aside className="dash-side">
      <div className="dash-side-top">
        {logo}
        <button
          ref={menu.buttonRef}
          type="button"
          className="hamburger"
          aria-expanded={menu.open}
          aria-controls="dash-menu"
          aria-label={menu.open ? 'Close menu' : 'Open menu'}
          onClick={menu.toggle}
        >
          <HamburgerIcon open={menu.open} />
        </button>
      </div>
      {menu.open && <div className="menu-backdrop dash-backdrop" onClick={() => menu.close()} aria-hidden="true" />}
      <nav id="dash-menu" ref={menu.panelRef} className={`dash-nav${menu.open ? ' open' : ''}`} aria-label="Planner">
        <Link href="/dashboard/events/new" className="dash-new" onClick={() => menu.close()}>
          <span aria-hidden="true">+</span> New event
        </Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="dash-link" aria-current={isActive(l.href) ? 'page' : undefined} onClick={() => menu.close()}>
            <Icon name={l.icon} />
            {l.label}
          </Link>
        ))}
        <form action={logout} className="dash-logout">
          <button type="submit" className="dash-link">
            <Icon name="logout" />
            Log out
          </button>
        </form>
      </nav>
    </aside>
  );
}
