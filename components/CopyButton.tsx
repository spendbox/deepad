'use client';

import { useState } from 'react';

export default function CopyButton({ text, label = 'Copy', dark = false }: { text: string; label?: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older phones: fall back to a hidden text box.
      const t = document.createElement('textarea');
      t.value = text;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      try {
        document.execCommand('copy');
      } catch {}
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const style = dark
    ? { borderColor: 'var(--gold)', background: copied ? 'var(--gold)' : 'transparent', color: copied ? 'var(--aubergine)' : 'var(--gold)' }
    : copied
      ? { background: 'var(--aubergine)', color: 'var(--gold)' }
      : undefined;

  return (
    <button type="button" className="btn btn-sm" onClick={copy} style={style}>
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  );
}
