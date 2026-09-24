'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CopyButton from '@/components/CopyButton';
import { groupAccountNumber, naira } from '@/lib/money';

type State = 'pending' | 'paid' | 'expired';

type Props = {
  slug: string;
  reference: string;
  initialState: State;
  totalKobo: number;
  sprayKobo: number;
  feeKobo: number;
  accountNumber: string;
  bankName: string;
  accountName: string;
  expiresAt: string;
  screenName: string;
  message: string | null;
  canSimulate: boolean;
};

function minutesLeft(expiresAt: string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

export default function PayScreen(p: Props) {
  const [state, setState] = useState<State>(p.initialState);
  const [left, setLeft] = useState(() => minutesLeft(p.expiresAt));
  const [simulating, setSimulating] = useState(false);

  // Check every 3 seconds whether the money has landed.
  useEffect(() => {
    if (state !== 'pending') return;
    let stop = false;
    const tick = async () => {
      setLeft(minutesLeft(p.expiresAt));
      try {
        const res = await fetch(`/api/intents/${encodeURIComponent(p.reference)}`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (!stop && json.state !== 'pending') setState(json.state);
        }
      } catch {
        // Phone lost signal for a moment; try again on the next tick.
      }
    };
    const id = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [state, p.reference, p.expiresAt]);

  async function simulate() {
    setSimulating(true);
    try {
      const res = await fetch(`/api/intents/${encodeURIComponent(p.reference)}/simulate`, { method: 'POST' });
      if (res.ok) setState('paid');
    } finally {
      setSimulating(false);
    }
  }

  const sprayAgain = `/s/${encodeURIComponent(p.slug)}`;

  if (state === 'paid') {
    return (
      <div className="phone-body">
        <div className="success-hero" role="status">
          <span className="big">You’re on the big screen!</span>
          <span className="display tabular" style={{ fontSize: 44 }}>{naira(p.sprayKobo)}</span>
          <span>
            {p.screenName}
            {p.message ? `: “${p.message}”` : ''}
          </span>
        </div>
        <Link href={sprayAgain} className="btn-primary">Spray again</Link>
      </div>
    );
  }

  return (
    <div className="phone-body">
      <div className="card" style={{ gap: 14 }}>
        <div>
          <div className="muted-label">Send in one transfer</div>
          <div className="split-row">
            <div className="display tabular" style={{ fontSize: 36, lineHeight: 1.1 }}>{naira(p.totalKobo)}</div>
            <CopyButton text={String(p.totalKobo / 100)} label="Copy" />
          </div>
          <div className="muted-label">
            {naira(p.sprayKobo)} spray + {naira(p.feeKobo)} service fee
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--line)' }} />
        <div>
          <div className="muted-label">Account number</div>
          <div className="split-row">
            <div className="acct-big">{groupAccountNumber(p.accountNumber)}</div>
            <CopyButton text={p.accountNumber} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <div>
            <div className="muted-label">Bank</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{p.bankName}</div>
          </div>
          <div>
            <div className="muted-label">Account name</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{p.accountName}</div>
          </div>
        </div>
      </div>

      {state === 'expired' ? (
        <div className="status expired" role="status">
          <div>
            <strong>This account number has expired.</strong>
            <div className="hint">Please don’t send money to it. Start again to get a fresh one.</div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span>
              This account number works for the next {left} minute{left === 1 ? '' : 's'}.
            </span>
          </div>
          <div className="status" role="status">
            <div className="spinner" aria-hidden="true" />
            <div>
              <strong>Waiting for your transfer</strong>
              <div className="hint" style={{ color: '#2f4a3a' }}>
                Your spray pops up on the big screen the moment it lands. You can close this page.
              </div>
            </div>
          </div>
        </>
      )}

      <div className="preview">
        <div className="small">On screen as</div>
        <div style={{ fontWeight: 700 }}>
          {p.screenName}
          {p.message ? `: “${p.message}”` : ''}
        </div>
      </div>

      {p.canSimulate && state === 'pending' && (
        <button type="button" className="btn-test" onClick={simulate} disabled={simulating}>
          {simulating ? 'Sending test payment…' : 'Test mode: pretend I’ve paid'}
        </button>
      )}

      <Link href={sprayAgain} className="btn-link">Change amount or name</Link>
    </div>
  );
}
