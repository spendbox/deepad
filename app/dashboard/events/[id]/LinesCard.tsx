'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Avatar from '@/components/Avatar';
import SectionCard from '@/components/SectionCard';
import CopyButton from '@/components/CopyButton';
import LineForm from '@/components/LineForm';
import type { LineStatus, SprayLine } from '@/lib/types';
import { addLine, deleteLine, linesViewLink, setLinesStatus } from '../../../actions';

type Filter = LineStatus | 'all';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'Waiting' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];
const STATUS_LABEL: Record<LineStatus, string> = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected' };
const REFRESH_MS = 4000;

/**
 * Lines on the big screen. Guests' lines wait here until the planner approves
 * them (one by one or all at once); only approved lines reach the screen.
 * The list updates by itself as new lines arrive.
 */
export default function LinesCard({
  eventId,
  initialLines,
  writeLink,
  plannerName,
  celebrantName,
  ended,
}: {
  eventId: string;
  initialLines: SprayLine[];
  writeLink: string;
  plannerName: string;
  celebrantName: string;
  ended: boolean;
}) {
  const [lines, setLines] = useState(initialLines);
  const [filter, setFilter] = useState<Filter>(initialLines.some((l) => l.status === 'pending') ? 'pending' : 'all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [viewLink, setViewLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [busy, start] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/lines`, { cache: 'no-store' });
      if (res.ok) setLines(((await res.json()) as { lines: SprayLine[] }).lines);
    } catch {}
  }, [eventId]);

  // New lines appear by themselves (checked every few seconds while this page is open).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, all: lines.length };
    for (const l of lines) c[l.status] += 1;
    return c;
  }, [lines]);
  const shown = filter === 'all' ? lines : lines.filter((l) => l.status === filter);
  const shownSelected = shown.filter((l) => selected.has(l.id));
  const allShownSelected = shown.length > 0 && shownSelected.length === shown.length;

  function act(ids: string[], status: LineStatus) {
    if (!ids.length) return;
    setError(null);
    setSaving(new Set(ids));
    // Only show a line as approved once it's really saved.
    start(async () => {
      const res = await setLinesStatus(eventId, ids, status).catch(() => ({ error: 'That didn’t save. Check your internet and try again.' }));
      if ('error' in res) setError(res.error);
      else {
        setLines(res.lines);
        setSelected(new Set());
      }
      setSaving(new Set());
    });
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Write a line for ${celebrantName}! It may show on the big screen at the party: ${writeLink}`)}`;

  return (
    <>
      <SectionCard icon="link" title="Share" hint="Guests write lines from one link; someone else can watch them all from another.">
        <div className="subcards">
          {!ended && (
            <div className="subcard">
              <strong>Let guests write lines</strong>
              <span className="hint">They write a line, add their name and (if they like) a photo. You approve before it shows.</span>
              <span className="share-url">{writeLink}</span>
              <div className="actions">
                <CopyButton text={writeLink} label="Copy link" />
                <a href={whatsapp} target="_blank" rel="noreferrer" className="btn btn-sm">Share on WhatsApp</a>
              </div>
            </div>
          )}
          <div className="subcard">
            <strong>View-only page</strong>
            <span className="hint">Every line, live, with its status. Nothing can be changed there, and it shows no money.</span>
            {viewLink ? (
              <>
                <span className="share-url">{viewLink}</span>
                <div className="actions">
                  <CopyButton text={viewLink} label="Copy link" />
                  <button
                    type="button"
                    className="link-btn"
                    disabled={busy}
                    onClick={() => {
                      if (confirm('Make a new link? The old one will stop working.')) start(async () => setViewLink(await linesViewLink(eventId, true)));
                    }}
                  >
                    Make a new link
                  </button>
                </div>
              </>
            ) : (
              <div>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => start(async () => setViewLink(await linesViewLink(eventId)))}>
                  Get the view-only link
                </button>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon="lines"
        title="Lines on the big screen"
        id="lines"
        hint={`Short wishes for ${celebrantName}. Only approved lines show on the big screen, taking turns over and over.`}
      >
      {adding ? (
        <div className="stack" style={{ gap: 8 }}>
          <LineForm
            action={addLine.bind(null, eventId)}
            defaultName={plannerName}
            submitLabel="Add line"
            onSent={() => {
              setAdding(false);
              refresh();
            }}
          />
          <button type="button" className="link-btn" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <div>
          <button type="button" className="btn btn-dark" onClick={() => setAdding(true)}>+ Write a line</button>
          <span className="hint" style={{ marginLeft: 10 }}>Yours are approved straight away.</span>
        </div>
      )}

      <div className="seg lines-filter" role="group" aria-label="Show lines">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id);
              setSelected(new Set());
            }}
          >
            {f.label} <span className="count">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      {shown.length === 0 ? (
        <p className="empty" style={{ margin: 0 }}>
          {filter === 'pending' ? 'Nothing waiting for approval.' : lines.length ? 'No lines here.' : 'No lines yet. Write one, or share the link with guests.'}
        </p>
      ) : (
        <>
          <div className="bulk-bar">
            <label className="check-row">
              <input
                type="checkbox"
                checked={allShownSelected}
                onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((l) => l.id)))}
              />
              <span>{shownSelected.length ? `${shownSelected.length} selected` : 'Select all'}</span>
            </label>
            {shownSelected.length > 0 ? (
              <div className="actions">
                <button type="button" className="btn btn-sm btn-dark" disabled={busy} onClick={() => act(shownSelected.map((l) => l.id), 'approved')}>
                  Approve selected
                </button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => act(shownSelected.map((l) => l.id), 'rejected')}>
                  Reject selected
                </button>
              </div>
            ) : (
              counts.pending > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-dark"
                  disabled={busy}
                  onClick={() => act(lines.filter((l) => l.status === 'pending').map((l) => l.id), 'approved')}
                >
                  Approve all waiting ({counts.pending})
                </button>
              )
            )}
          </div>

          <ul className="lines-list">
            {shown.map((l) => (
              <li key={l.id} className={`line-${l.status}${saving.has(l.id) ? ' saving' : ''}`}>
                <input
                  type="checkbox"
                  className="line-check"
                  aria-label={`Select the line by ${l.authorName}`}
                  checked={selected.has(l.id)}
                  onChange={() => toggle(l.id)}
                />
                <Avatar name={l.authorName} photo={l.photoUrl} size={40} />
                <div className="line-body">
                  <strong>
                    {l.authorName} <span className="hint">· {l.source === 'guest' ? 'guest' : 'you'}</span>{' '}
                    <span className={`line-pill ${l.status}`}>{saving.has(l.id) ? 'Saving…' : STATUS_LABEL[l.status]}</span>
                  </strong>
                  <p>“{l.text}”</p>
                </div>
                <div className="line-actions">
                  {l.status !== 'approved' && (
                    <button type="button" className="btn btn-sm btn-dark" disabled={busy} onClick={() => act([l.id], 'approved')}>Approve</button>
                  )}
                  {l.status !== 'rejected' && (
                    <button type="button" className="btn btn-sm" disabled={busy} onClick={() => act([l.id], 'rejected')}>Reject</button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    aria-label={`Delete the line by ${l.authorName}`}
                    onClick={() => {
                      if (!confirm('Delete this line for good?')) return;
                      setLines((ls) => ls.filter((x) => x.id !== l.id));
                      start(async () => {
                        await deleteLine(eventId, l.id);
                        await refresh();
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      </SectionCard>
    </>
  );
}
