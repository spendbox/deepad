'use client';

import { useActionState } from 'react';
import { adminLogin } from '../../actions';

export default function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminLogin, null);
  return (
    <form action={action} className="form">
      <div className="field">
        <label htmlFor="password">Admin password</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      <button type="submit" className="btn btn-dark btn-lg btn-block" disabled={pending}>{pending ? 'Checking…' : 'Log in'}</button>
    </form>
  );
}
