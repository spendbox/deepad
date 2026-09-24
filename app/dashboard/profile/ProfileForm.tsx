'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import BankAccountFields, { type BankAccount } from '@/components/BankAccountFields';
import { savePayoutAccount } from '../../actions';

type Props = {
  welcome: boolean;
  planner: { name: string; email: string; phone: string } & BankAccount;
};

export default function ProfileForm({ welcome, planner }: Props) {
  const [state, action, pending] = useActionState(savePayoutAccount, null);
  const [acct, setAcct] = useState<BankAccount>({
    bankCode: planner.bankCode,
    bankName: planner.bankName,
    accountNumber: planner.accountNumber,
    accountName: planner.accountName,
  });
  const ready = acct.accountNumber.length === 10 && !!acct.bankName && !!acct.accountName;

  return (
    <form action={action} className="card form">
      {welcome && <input type="hidden" name="next" value="dashboard" />}
      {!welcome && (
        <>
          <div className="field">
            <label htmlFor="p-name">Name or business name</label>
            <input id="p-name" name="name" className="input" defaultValue={planner.name} />
          </div>
          <div className="field">
            <label htmlFor="p-phone">Phone</label>
            <input id="p-phone" name="phone" type="tel" className="input" defaultValue={planner.phone} />
          </div>
          <div className="field">
            <span className="field-label">Email</span>
            <span>{planner.email}</span>
          </div>
          <h2 style={{ marginTop: 8 }}>Your payout account</h2>
        </>
      )}
      <BankAccountFields value={acct} onChange={setAcct} namePrefix="" label="Your bank" />
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      {state?.ok && <p className="ok-text" role="status">{state.ok}</p>}
      <button type="submit" className="btn btn-dark btn-lg btn-block" disabled={pending || !ready}>
        {pending ? 'Saving…' : welcome ? 'Save and continue' : 'Save'}
      </button>
      {welcome && <Link href="/dashboard" className="link-btn" style={{ textAlign: 'center' }}>I’ll do this later</Link>}
    </form>
  );
}
