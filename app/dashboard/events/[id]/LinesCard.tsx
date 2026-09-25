'use client';

import { useState, useTransition } from 'react';
import Avatar from '@/components/Avatar';
import CopyButton from '@/components/CopyButton';
import LineForm from '@/components/LineForm';
import type { SprayLine } from '@/lib/types';
import { addLine, deleteLine, setLineHidden } from '../../../actions';

/**
 * Lines on the big screen: the planner writes some, shares a link so guests
 * can write their own, and can hide or delete any of them.
 */
export default function LinesCard({
  eventId,
  lines,
  writeLink,
  plannerName,
  celebrantName,
  ended,
}: {
  eventId: string;
  lines: SprayLine[];
  writeLink: string;
  plannerName: string;
  celebrantName: string;
  ended: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [busy, start] = useTransition();
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Write a line for ${celebrantName}! It will show on the big screen at the party: ${writeLink}`)}`;
  const shown = lines.filter((l) => !l.hidden).length;

  return (
    <section className="card settings-card" aria-labelledby="lines-h">
      <div className="settings-head">
        <h2 id="lines-h">Lines on the big screen</h2>
        <span className="hint">
          Short wishes for {celebrantName}, with the writer’s name and photo. They take turns on the big screen.
        </span>
      </div>

      {!ended && (
        <div className="stack" style={{ gap: 8 }}>
          <strong>Let guests write lines</strong>
          <span className="hint">Share this link. Guests write a line, add their name and (if they like) a photo.</span>
          <div className="share-row">
            <span className="share-url">{writeLink}</span>
            <CopyButton text={writeLink} label="Copy link" />
            <a href={whatsapp} target="_blank" rel="noreferrer" className="btn btn-sm">Share on WhatsApp</a>
          </div>
        </div>
      )}

      {adding ? (
        <div className="stack" style={{ gap: 8 }}>
          <LineForm action={addLine.bind(null, eventId)} defaultName={plannerName} submitLabel="Add line" onSent={() => setAdding(false)} />
          <button type="button" className="link-btn" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <div>
          <button type="button" className="btn btn-dark" onClick={() => setAdding(true)}>+ Write a line</button>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="empty" style={{ margin: 0 }}>No lines yet. Write one, or share the link with guests.</p>
      ) : (
        <>
          <span className="hint">{shown} showing{lines.length > shown ? ` · ${lines.length - shown} hidden` : ''}</span>
          <ul className="lines-list">
            {lines.map((l) => (
              <li key={l.id} className={l.hidden ? 'hidden-line' : ''}>
                <Avatar name={l.authorName} photo={l.photoUrl} size={40} />
                <div className="line-body">
                  <strong>
                    {l.authorName} <span className="hint">· {l.source === 'guest' ? 'guest' : 'you'}{l.hidden ? ' · hidden' : ''}</span>
                  </strong>
                  <p>“{l.text}”</p>
                </div>
                <div className="line-actions">
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => start(() => setLineHidden(eventId, l.id, !l.hidden))}>
                    {l.hidden ? 'Show' : 'Hide'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    aria-label={`Delete the line by ${l.authorName}`}
                    onClick={() => {
                      if (confirm('Delete this line for good?')) start(() => deleteLine(eventId, l.id));
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
    </section>
  );
}
