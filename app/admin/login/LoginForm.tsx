'use client';

import { useActionState } from 'react';
import { login } from '../actions';

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label htmlFor="password" style={{ fontWeight: 700 }}>Password</label>
      <input id="password" name="password" type="password" className="input" autoComplete="current-password" required autoFocus />
      {error && <p role="alert" style={{ color: '#ffb59b', margin: 0 }}>{error}</p>}
      <button type="submit" className="btn" disabled={pending} style={{ minHeight: 52 }}>
        {pending ? 'Checking…' : 'Log in'}
      </button>
    </form>
  );
}
