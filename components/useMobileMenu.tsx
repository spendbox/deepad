'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A phone menu behind a hamburger button. It closes when you pick a page,
 * press Escape, tap outside it, or the screen gets wide enough for the full
 * navigation. While open, the page behind it doesn't scroll, and focus moves
 * into the menu (and back to the button when it closes).
 */
export function useMobileMenu(desktopQuery = '(min-width: 900px)') {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  // A new page: the menu has done its job.
  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const wide = window.matchMedia(desktopQuery);
    const onWide = () => wide.matches && setOpen(false);
    document.addEventListener('keydown', onKey);
    wide.addEventListener('change', onWide);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
      document.body.style.overflow = overflow;
    };
  }, [open, close, desktopQuery]);

  return { open, toggle, close, buttonRef, panelRef };
}

/** The ☰ / ✕ button that opens and closes a phone menu. */
export function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}
