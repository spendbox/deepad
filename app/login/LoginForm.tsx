'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import PasswordInput from '@/components/PasswordInput';
import { login } from '../actions';

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="form">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required inputMode="email" />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <PasswordInput id="password" name="password" autoComplete="current-password" />
        <Link href="/forgot-password" className="hint" style={{ alignSelf: 'flex-end', minHeight: 32, display: 'inline-flex', alignItems: 'center' }}>
          Forgot password?
        </Link>
      </div>
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      <button type="submit" className="btn btn-dark btn-lg btn-block" disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
