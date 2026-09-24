'use client';

import { useActionState } from 'react';
import PasswordInput from '@/components/PasswordInput';
import { signup } from '../actions';

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, null);
  return (
    <form action={action} className="form">
      <div className="field">
        <label htmlFor="name">Your name or business name</label>
        <input id="name" name="name" className="input" autoComplete="organization" required placeholder="e.g. Kunle Events" />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required inputMode="email" />
        <span className="hint">Your event reports are sent here.</span>
      </div>
      <div className="field">
        <label htmlFor="phone">Phone number</label>
        <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" required inputMode="tel" placeholder="0803 000 0000" />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} />
        <span className="hint">At least 8 characters.</span>
      </div>
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      <button type="submit" className="btn btn-dark btn-lg btn-block" disabled={pending}>
        {pending ? 'Creating your account…' : 'Continue'}
      </button>
    </form>
  );
}
