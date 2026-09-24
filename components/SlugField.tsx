'use client';

import { useEffect, useState } from 'react';
import { slugify, slugProblem } from '@/lib/slug';

type Status = { state: 'idle' | 'checking' | 'ok' | 'bad'; message?: string };

/** The event's short link, e.g. dashpad.ng/tolu-and-dayo, checked as you type. */
export default function SlugField({
  value,
  onChange,
  exceptEventId,
  name,
  onStatus,
}: {
  value: string;
  onChange: (slug: string) => void;
  exceptEventId?: string;
  name?: string;
  onStatus?: (ok: boolean) => void;
}) {
  const [host, setHost] = useState('dashpad.ng');
  const [status, setStatus] = useState<Status>({ state: 'idle' });

  useEffect(() => setHost(window.location.host), []);

  useEffect(() => {
    const problem = slugProblem(value);
    if (problem) {
      setStatus({ state: 'bad', message: problem });
      onStatus?.(false);
      return;
    }
    setStatus({ state: 'checking' });
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ slug: value, ...(exceptEventId ? { except: exceptEventId } : {}) });
        const res = await fetch(`/api/slug-check?${q}`);
        const json = await res.json();
        setStatus(json.available ? { state: 'ok' } : { state: 'bad', message: json.error });
        onStatus?.(!!json.available);
      } catch {
        setStatus({ state: 'idle' });
        onStatus?.(true); // the server checks again when saving
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, exceptEventId]);

  return (
    <div className="field">
      <label htmlFor="slug-input">Your event link</label>
      <div className="slug-wrap">
        <span className="slug-host">{host}/</span>
        <input
          id="slug-input"
          name={name}
          className="slug-input"
          value={value}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => onChange(slugify(e.target.value.replace(/\s/g, '-')) + (/[\s-]$/.test(e.target.value) ? '-' : ''))}
          onBlur={() => onChange(slugify(value))}
        />
      </div>
      {status.state === 'checking' && <span className="hint">Checking…</span>}
      {status.state === 'ok' && <span className="ok-text" style={{ fontSize: 14 }}>✓ This link is free</span>}
      {status.state === 'bad' && <span className="error-text" style={{ fontSize: 14 }}>{status.message}</span>}
    </div>
  );
}
