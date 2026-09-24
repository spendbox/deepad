'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { groupAccountNumber, naira } from '@/lib/money';

type State = 'pending' | 'paid' | 'expired';

type Props = {
  slug: string;
  reference: string;
  paidAlready: boolean;
  amountKobo: number;
  message: string | null;
  accountNumber: string;
  bankName: string;
  accountName: string;
  expiresAt: string;
};

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="g-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {}
        setDone(true);
        setTimeout(() => setDone(false), 2500);
      }}
    >
      <span aria-live="polite">{done ? 'Copied' : label}</span>
    </button>
  );
}

const minutesLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));

export default function PayScreen(p: Props) {
  const [state, setState] = useState<State>(p.paidAlready ? 'paid' : 'pending');
  const [left, setLeft] = useState(() => minutesLeft(p.expiresAt));

  // Every few seconds: has the money landed?
  useEffect(() => {
    if (state !== 'pending') return;
    let stop = false;
    const id = setInterval(async () => {
      setLeft(minutesLeft(p.expiresAt));
      try {
        const res = await fetch(`/api/intents/${encodeURIComponent(p.reference)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (!stop && json.state !== 'pending') setState(json.state);
      } catch {}
    }, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [state, p.reference, p.expiresAt]);

  const again = `/${encodeURIComponent(p.slug)}/spray`;

  if (state === 'paid') {
    return (
      <>
        <section className="g-card g-success" role="status">
          <div className="g-title">Your message is on the big screen!</div>
          <div className="g-amt-big">{naira(p.amountKobo)}</div>
          {p.message && <div className="g-msg">“{p.message}”</div>}
        </section>
        <Link href={again} className="g-btn">Spray again</Link>
      </>
    );
  }

  return (
    <>
      <section className="g-card">
        <div>
          <div className="g-hint">Send exactly this amount, in one transfer</div>
          <div className="g-row">
            <span className="g-amt-big">{naira(p.amountKobo)}</span>
            <Copy text={String(p.amountKobo / 100)} label="Copy" />
          </div>
        </div>
        <div>
          <div className="g-hint">To this account number</div>
          <div className="g-row">
            <span className="g-acct">{groupAccountNumber(p.accountNumber)}</span>
            <Copy text={p.accountNumber} label="Copy" />
          </div>
          <div className="g-bank">{p.bankName}</div>
          <div className="g-hint">{p.accountName}</div>
        </div>
        {p.message && (
          <div>
            <div className="g-hint">Your message on the big screen</div>
            <div className="g-msg">“{p.message}”</div>
          </div>
        )}
      </section>

      {state === 'expired' ? (
        <div className="g-card" role="status">
          <strong>This account number has expired.</strong>
          <span className="g-hint">Please don’t send money to it. Start again to get a fresh one.</span>
          <Link href={again} className="g-btn">Start again</Link>
        </div>
      ) : (
        <>
          <div className="g-wait" role="status">
            <div className="g-spin" aria-hidden="true" />
            <div>
              <strong>Waiting for your transfer</strong>
              <div className="g-hint">
                This account number works for the next {left} minute{left === 1 ? '' : 's'}, for this spray only. It can
                take up to a minute after you send for your message to appear.
              </div>
            </div>
          </div>
          <Link href={again} className="g-link">Change message or amount</Link>
        </>
      )}
    </>
  );
}
