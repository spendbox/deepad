'use client';

import { useActionState } from 'react';
import { requestPasswordReset } from '../actions';

export default function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  if (state?.ok) {
    return <div className="banner info" role="status">{state.ok} Check your spam folder if you don’t see it.</div>;
  }
  return (
    <form action={action} className="form">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" inputMode="email" required />
      </div>
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      <button type="submit" className="btn btn-dark btn-lg btn-block" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
