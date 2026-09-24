'use client';

import { useActionState } from 'react';
import { resendReport } from '../../../actions';

export default function ReportButton({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState(resendReport.bind(null, eventId), null);
  return (
    <form action={action} className="actions">
      <button type="submit" className="btn" disabled={pending}>{pending ? 'Sending…' : 'Email me the report'}</button>
      {state?.ok && <span className="ok-text" role="status">{state.ok}</span>}
      {state?.error && <span className="error-text" role="alert">{state.error}</span>}
    </form>
  );
}
