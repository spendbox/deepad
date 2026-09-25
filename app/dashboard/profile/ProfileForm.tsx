'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import BankAccountFields, { type BankAccount } from '@/components/BankAccountFields';
import BankCard from '@/components/BankCard';
import PayoutNote from '@/components/PayoutNote';
import { saveProfileDetails, savePayoutAccount } from '../../actions';

type Props = {
  welcome: boolean;
  planner: { name: string; email: string; phone: string } & BankAccount;
};

export function DetailsForm({ planner }: { planner: { name: string; email: string; phone: string } }) {
  const [state, action, pending] = useActionState(saveProfileDetails, null);
  return (
    <form action={action} className="card form">
      <h2>Your details</h2>
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
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      {state?.ok && <p className="ok-text" role="status">{state.ok}</p>}
      <button type="submit" className="btn btn-dark btn-block" disabled={pending}>
        {pending ? 'Saving…' : 'Save details'}
      </button>
    </form>
  );
}

export default function ProfileForm({ welcome, planner }: Props) {
  const [state, action, pending] = useActionState(savePayoutAccount, null);
  const saved: BankAccount = {
    bankCode: planner.bankCode,
    bankName: planner.bankName,
    accountNumber: planner.accountNumber,
    accountName: planner.accountName,
  };
  const hasSaved = saved.accountNumber.length === 10 && !!saved.accountName;
  const [editing, setEditing] = useState(!hasSaved);
  const [acct, setAcct] = useState<BankAccount>(saved);
  const ready = acct.accountNumber.length === 10 && !!acct.bankName && !!acct.accountName;

  // Once saved, fold the form back into the card.
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <section className="card form">
        {!welcome && <h2>Your payout account</h2>}
        <BankCard
          bankName={planner.bankName}
          accountNumber={planner.accountNumber}
          accountName={planner.accountName}
          onEdit={() => {
            setAcct(saved);
            setEditing(true);
          }}
        />
        {state?.ok && <p className="ok-text" role="status">{state.ok}</p>}
        <PayoutNote>Your cut from each spray is paid into this account within 2 business days.</PayoutNote>
        {welcome && <Link href="/dashboard" className="btn btn-dark btn-lg btn-block">Continue</Link>}
      </section>
    );
  }

  return (
    <form action={action} className="card form">
      {welcome && <input type="hidden" name="next" value="dashboard" />}
      {!welcome && <h2>{hasSaved ? 'Change payout account' : 'Your payout account'}</h2>}
      <BankAccountFields value={acct} onChange={setAcct} namePrefix="" label="Your bank" />
      <PayoutNote>Your cut from each spray is paid into this account within 2 business days.</PayoutNote>
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      <button type="submit" className="btn btn-dark btn-lg btn-block" disabled={pending || !ready}>
        {pending ? 'Saving…' : welcome ? 'Save and continue' : 'Save account'}
      </button>
      {hasSaved && (
        <button type="button" className="link-btn" style={{ textAlign: 'center' }} onClick={() => setEditing(false)}>
          Cancel
        </button>
      )}
      {welcome && !hasSaved && <Link href="/dashboard" className="link-btn" style={{ textAlign: 'center' }}>I’ll do this later</Link>}
    </form>
  );
}
