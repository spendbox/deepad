'use client';

import { useState, useTransition } from 'react';
import { setPaused } from '../../../actions';

/** Live / Paused switch for the big screen. Paused: sprays wait in line and show when you switch back to live. */
export default function PauseToggle({ eventId, paused }: { eventId: string; paused: boolean }) {
  const [isPaused, setIsPaused] = useState(paused);
  const [error, setError] = useState(false);
  const [busy, start] = useTransition();

  function flip() {
    const next = !isPaused;
    setError(false);
    start(async () => {
      try {
        await setPaused(eventId, next);
        setIsPaused(next);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="pause-toggle">
      <label className={`pt-switch${isPaused ? ' paused' : ''}`}>
        <input type="checkbox" className="switch" role="switch" checked={!isPaused} onChange={flip} disabled={busy} aria-describedby="pt-hint" />
        <span className="pt-label">{busy ? 'Saving…' : isPaused ? 'Paused' : 'Live'}</span>
      </label>
      <span id="pt-hint" className="hint">
        {error ? 'That didn’t save. Try again.' : isPaused ? 'Sprays wait and show when you go live.' : 'Big screen is showing sprays.'}
      </span>
    </div>
  );
}
