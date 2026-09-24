'use client';

import { useActionState, useState } from 'react';
import { deleteSprayEvent } from '../../../actions';

export default function DeleteEvent({ eventId, hasMoney, live }: { eventId: string; hasMoney: boolean; live: boolean }) {
  const [state, action, pending] = useActionState(deleteSprayEvent.bind(null, eventId), null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  if (!open) {
    return (
      <button type="button" className="btn btn-sm" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        Delete this event
      </button>
    );
  }

  return (
    <form action={action} className="form">
      <div className="banner error">
        <strong>Delete this event?</strong> The event link and its account number will stop working straight away.
        {live && ' The event is live right now, so guests will no longer be able to spray.'}
        {hasMoney &&
          ' This event already received money: it will disappear from your events, but DashPad keeps its payment records, and payouts already made are not affected.'}
      </div>
      <div className="field">
        <label htmlFor="confirm-delete">Type DELETE to confirm</label>
        <input id="confirm-delete" name="confirm" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
        <button
          type="submit"
          className="btn"
          style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}
          disabled={pending || typed.trim().toLowerCase() !== 'delete'}
        >
          {pending ? 'Deleting…' : 'Delete event'}
        </button>
      </div>
    </form>
  );
}
