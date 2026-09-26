'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import Logo from '@/components/Logo';
import type { ViewOnlyData } from '@/lib/lines-view';
import type { LineStatus } from '@/lib/types';

type Filter = LineStatus | 'all';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'pending', label: 'Waiting' },
];
const LABEL: Record<LineStatus, string> = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected' };
const REFRESH_MS = 4000;

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', hour12: true, minute: '2-digit' });
}

/** The live list: new lines and status changes appear by themselves. */
export default function LinesLive({ token, initial }: { token: string; initial: ViewOnlyData }) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [gone, setGone] = useState(false);
  const known = useRef(new Set(initial.lines.map((l) => l.id)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/api/lines/${token}`, { cache: 'no-store' });
        if (res.status === 404) return setGone(true);
        if (!res.ok) return;
        const next = (await res.json()) as ViewOnlyData;
        const added = next.lines.filter((l) => !known.current.has(l.id)).map((l) => l.id);
        added.forEach((id) => known.current.add(id));
        if (added.length) setFresh(new Set(added));
        setData(next);
      } catch {}
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [token]);

  const counts = useMemo(() => {
    const c = { all: data.lines.length, pending: 0, approved: 0, rejected: 0 };
    for (const l of data.lines) c[l.status] += 1;
    return c;
  }, [data]);
  const shown = filter === 'all' ? data.lines : data.lines.filter((l) => l.status === filter);

  return (
    <div className="lv">
      <header className="lv-top">
        <Logo size={26} tone="dark" />
        <span className="lv-live"><span className="lv-dot" />Live</span>
      </header>
      <main className="lv-main">
        <div>
          <p className="hint" style={{ margin: 0 }}>{data.title}</p>
          <h1>Lines for {data.celebrantName}</h1>
          <p className="hint" style={{ margin: '6px 0 0' }}>
            View only. New lines and approvals appear here by themselves. Only approved lines show on the big screen.
          </p>
        </div>
        {gone && <div className="banner warn">This link has been turned off by the planner.</div>}

        <div className="seg lines-filter" role="group" aria-label="Show lines">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <span className="count">{counts[f.id]}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="empty">No lines here yet.</p>
        ) : (
          <ul className="lv-list">
            {shown.map((l) => (
              <li key={l.id} className={`lv-item line-${l.status}${fresh.has(l.id) ? ' fresh' : ''}`}>
                <Avatar name={l.name} photo={l.photo} size={44} />
                <div className="lv-body">
                  <div className="lv-head">
                    <strong>{l.name}</strong>
                    <span className="hint">{time(l.createdAt)}</span>
                    <span className={`line-pill ${l.status}`}>{LABEL[l.status]}</span>
                  </div>
                  <p>“{l.text}”</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
