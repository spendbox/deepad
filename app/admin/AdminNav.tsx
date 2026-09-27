'use client';

import Link from 'next/link';
import { HamburgerIcon, useMobileMenu } from '@/components/useMobileMenu';
import { adminLogout } from '../actions';

export type AdminTab = 'overview' | 'events' | 'payments' | 'planners' | 'setup';

const icons: Record<AdminTab | 'logout', React.ReactNode> = {
  overview: <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />,
  events: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  payments: (
    <>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  planners: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2" />
    </>
  ),
  setup: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
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

const TABS: { id: AdminTab; label: string; href: string }[] = [
  { id: 'overview', label: 'Overview', href: '/admin' },
  { id: 'events', label: 'Events', href: '/admin/events' },
  { id: 'payments', label: 'Payments', href: '/admin/payments' },
  { id: 'planners', label: 'Planners', href: '/admin/planners' },
  { id: 'setup', label: 'Setup', href: '/admin/setup' },
];

/**
 * The admin sections. Laptops: tabs along the top bar and a Log out button.
 * Phones and tablets: the current section's name and a menu button that opens
 * the full list over the page.
 */
export default function AdminNav({ tab, attention }: { tab: AdminTab; attention: boolean }) {
  const menu = useMobileMenu();
  const current = TABS.find((t) => t.id === tab);

  return (
    <>
      {/* Laptops */}
      <nav className="adm-nav" aria-label="Admin sections">
        {TABS.map((t) => (
          <Link key={t.id} href={t.href} aria-current={t.id === tab ? 'page' : undefined}>
            {t.label}
            {t.id === 'setup' && attention && <span className="adm-dot" aria-label="needs attention" />}
          </Link>
        ))}
      </nav>
      <form action={adminLogout} className="adm-logout">
        <button type="submit" className="adm-logout-btn">Log out</button>
      </form>

      {/* Phones and tablets */}
      <div className="adm-mnav">
        {current && <span className="adm-mnav-current">{current.label}</span>}
        <button
          ref={menu.buttonRef}
          type="button"
          className="hamburger"
          aria-expanded={menu.open}
          aria-controls="adm-menu"
          aria-label={menu.open ? 'Close menu' : 'Open menu'}
          onClick={menu.toggle}
        >
          <HamburgerIcon open={menu.open} />
          {attention && !menu.open && <span className="adm-dot on-btn" aria-hidden="true" />}
        </button>
      </div>
      {menu.open && <div className="menu-backdrop" onClick={() => menu.close()} aria-hidden="true" />}
      <nav
        id="adm-menu"
        ref={menu.panelRef}
        className={`adm-menu${menu.open ? ' open' : ''}`}
        aria-label="Admin sections"
        hidden={!menu.open}
      >
        {TABS.map((t) => (
          <Link key={t.id} href={t.href} className="menu-link" aria-current={t.id === tab ? 'page' : undefined} onClick={() => menu.close()}>
            <Icon name={t.id} />
            <span className="menu-link-label">{t.label}</span>
            {t.id === 'setup' && attention && <span className="menu-flag">Needs attention</span>}
          </Link>
        ))}
        <form action={adminLogout} className="menu-foot">
          <button type="submit" className="menu-link">
            <Icon name="logout" />
            <span className="menu-link-label">Log out</span>
          </button>
        </form>
      </nav>
    </>
  );
}
