'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Keeps the sprays list and totals fresh, but never while someone is typing. */
export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      const el = document.activeElement;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
