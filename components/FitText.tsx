'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/** Shows text as large as `max` px, shrinking only if it would not fit on one line. */
export default function FitText({ text, max, className }: { text: string; max: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(max);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = `${max}px`;
      const ratio = el.clientWidth / el.scrollWidth;
      const next = ratio < 1 ? Math.floor(max * ratio * 0.98) : max;
      el.style.fontSize = `${next}px`; // set directly too: React skips the update if `size` is unchanged
      setSize(next);
    };
    fit();
    // Re-check once the web font has loaded, since it changes the width.
    document.fonts?.ready.then(fit).catch(() => {});
  }, [text, max]);

  return (
    <div ref={ref} className={className} style={{ fontSize: size, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {text}
    </div>
  );
}
