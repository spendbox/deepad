'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logout } from '../actions';

const LINKS = [
  { href: '/dashboard', label: 'My events' },
  { href: '/dashboard/events/new', label: 'New event' },
  { href: '/dashboard/profile', label: 'Profile & payouts' },
];

/** Links in a row on wide screens; a hamburger menu on phones. */
export default function DashNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <button
        type="button"
        className="hamburger"
        aria-expanded={open}
        aria-controls="dash-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <nav id="dash-menu" className={`dash-nav${open ? ' open' : ''}`} aria-label="Account">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
        <form action={logout}>
          <button type="submit">Log out</button>
        </form>
      </nav>
    </>
  );
}
