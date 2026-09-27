'use client';

import { useActionState, useState } from 'react';
import BankAccountFields, { type BankAccount } from '@/components/BankAccountFields';
import { adminSendTestAlert } from '../actions';

const DEFAULT_MESSAGE = 'DashPad: your spray landed! Spray more: {link}';

/** Send ₦1 with a message and link to any bank account, to see how each bank shows it. */
export default function TestAlert() {
  const [state, action, pending] = useActionState(adminSendTestAlert, null);
  const [acct, setAcct] = useState<BankAccount>({ bankCode: '', bankName: '', accountNumber: '', accountName: '' });
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [sure, setSure] = useState(false);
  // Roughly how long the description will be once {link} becomes e.g. "dashpad.site/w/4F9A1C".
  const length = message.replace(/\{link\}/g, 'x'.repeat(21)).replace(/\{fulllink\}/g, 'x'.repeat(29)).length;

  return (
    <form action={action} className="stack" style={{ gap: 14, maxWidth: 520 }}>
      <BankAccountFields value={acct} onChange={(v) => { setAcct(v); setSure(false); }} namePrefix="" label="Send to bank" />
      <div className="field">
        <label htmlFor="ta-amount">Amount (₦)</label>
        <input id="ta-amount" name="amount" className="input" inputMode="numeric" defaultValue="1" />
      </div>
      <div className="field">
        <label htmlFor="ta-msg">Description on the alert</label>
        <input id="ta-msg" name="message" className="input" value={message} maxLength={100} onChange={(e) => setMessage(e.target.value)} />
        <span className="hint">
          <strong>{'{link}'}</strong> becomes a short link like dashpad.site/w/4F9A1C; <strong>{'{fulllink}'}</strong> adds https:// in
          front (some phones only make that tappable). About {length} characters.
        </span>
      </div>
      {acct.accountName && (
        <label className="check-row">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
          <span>Send real money from DashPad’s Paystack balance to {acct.accountName}</span>
        </label>
      )}
      <div className="actions">
        <button type="submit" className="btn btn-dark" disabled={pending || !acct.accountName || !sure}>
          {pending ? 'Sending…' : 'Send test alert'}
        </button>
      </div>
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      {state?.ok && (
        <p className="ok-text" role="status">
          {state.ok}
          {state.sent && <><br />Description sent: “{state.sent}”</>}
        </p>
      )}
    </form>
  );
}
