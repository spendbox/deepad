'use client';

import { useState } from 'react';

/** A password box with an eye button to show or hide what's typed. */
export default function PasswordInput(props: {
  id: string;
  name: string;
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        id={props.id}
        name={props.name}
        type={show ? 'text' : 'password'}
        className="input"
        autoComplete={props.autoComplete}
        minLength={props.minLength}
        required
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 002.8 2.8" />
            <path d="M9.9 5.1A9.7 9.7 0 0112 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.6M6.1 6.1C4 7.5 2.6 9.6 2 12c1 2.5 5 7 10 7 1.8 0 3.5-.6 4.9-1.4" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
