'use client';

import { useRef } from 'react';
import { naira, percent, splitTransfer } from '@/lib/money';

/** A quiet button that opens how every spray is shared out. Read-only: it can't be changed after the event is created. */
export default function SplitDialog({
  plannerFeeBps,
  platformFeeBps,
  celebrantName,
  celebrantAccount,
  plannerAccount,
}: {
  plannerFeeBps: number;
  platformFeeBps: number;
  celebrantName: string;
  celebrantAccount: string;
  plannerAccount: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const ex = splitTransfer(10_000_00, plannerFeeBps);
  const rows = [
    { who: celebrantName, share: 10000 - plannerFeeBps - platformFeeBps, kobo: ex.celebrantKobo, to: celebrantAccount, color: 'var(--green)' },
    { who: 'You', share: plannerFeeBps, kobo: ex.plannerFeeKobo, to: plannerAccount ?? 'Your bank account (add it in your profile)', color: 'var(--gold)' },
    { who: 'DashPad', share: platformFeeBps, kobo: ex.platformFeeKobo, to: 'Covers the service and Paystack’s fees', color: 'var(--plum-soft)' },
  ];
  return (
    <>
      <button type="button" className="link-btn split-link" onClick={() => ref.current?.showModal()}>
        How the money is split
      </button>
      <dialog
        ref={ref}
        className="sprays-dialog split-dialog"
        aria-label="How the money is split"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="sprays-dialog-head">
          <h2>How the money is split</h2>
          <button type="button" className="btn btn-sm" onClick={() => ref.current?.close()}>Close</button>
        </div>
        <div className="sprays-dialog-body split-body">
          <p className="hint" style={{ marginTop: 0 }}>Every spray is shared out automatically by Paystack. For example, on a ₦10,000 spray:</p>
          <div className="split-bar" aria-hidden="true">
            {rows.map((r) => <span key={r.who} style={{ width: `${r.share / 100}%`, background: r.color }} />)}
          </div>
          <ul className="split-list">
            {rows.map((r) => (
              <li key={r.who}>
                <i className="dot" style={{ background: r.color }} aria-hidden="true" />
                <div>
                  <strong>{r.who}</strong> <span className="hint">· {percent(r.share)}</span>
                  <div className="hint">{r.to}</div>
                </div>
                <strong className="num">{naira(r.kobo)}</strong>
              </li>
            ))}
          </ul>
          <p className="hint">Payouts reach each bank account within 2 business days. The split was set when the event was created and can’t be changed.</p>
        </div>
      </dialog>
    </>
  );
}
