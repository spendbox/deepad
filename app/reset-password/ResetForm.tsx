'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import PasswordInput from '@/components/PasswordInput';
import { resetPassword } from '../actions';

export default function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, null);
  return (
    <form action={action} className="form">
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="password">New password</label>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} />
        <span className="hint">At least 8 characters. You’ll be logged out on your other devices.</span>
      </div>
      {state?.error && (
        <p className="error-text" role="alert">
          {state.error} <Link href="/forgot-password">Get a new link</Link>
        </p>
      )}
      <button type="submit" className="btn btn-dark btn-lg btn-block" disabled={pending}>
        {pending ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  );
}
