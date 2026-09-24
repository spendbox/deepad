'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Keeps the numbers fresh during the party, but never while someone is typing. */
export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      const el = document.activeElement;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (document.visibilityState !== 'visible') return;
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
