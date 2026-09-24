'use client';

import { useActionState } from 'react';

type Action = (prev: string | null, form: FormData) => Promise<string | null>;

export default function SimulateForm({ action }: { action: Action }) {
  const [message, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="sim-name">Sender’s bank account name</label>
          <input id="sim-name" name="senderName" className="input" defaultValue="OLUWASEUN ADEBAYO" />
        </div>
        <div className="field">
          <label htmlFor="sim-amount">Amount (₦)</label>
          <input id="sim-amount" name="amountNaira" className="input" inputMode="numeric" defaultValue="15000" />
        </div>
        <div className="field">
          <label htmlFor="sim-narration">Description they typed in their bank app</label>
          <input id="sim-narration" name="narration" className="input" defaultValue="Happy married life!" />
        </div>
      </div>
      <div className="actions">
        <button type="submit" className="btn dark" disabled={pending}>{pending ? 'Sending…' : 'Send test transfer'}</button>
        {message && <span role="status" style={{ fontWeight: 700 }}>{message}</span>}
      </div>
    </form>
  );
}
