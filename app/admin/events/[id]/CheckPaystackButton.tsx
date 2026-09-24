'use client';

import { useActionState } from 'react';
import { adminCheckPaystack } from '../../../actions';

export default function CheckPaystackButton({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState(adminCheckPaystack.bind(null, eventId), null);
  return (
    <form action={action} className="actions">
      <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>{pending ? 'Checking…' : 'Check Paystack now'}</button>
      {state?.ok && <span className="ok-text" role="status">{state.ok}</span>}
      {state?.error && <span className="error-text" role="alert">{state.error}</span>}
    </form>
  );
}
