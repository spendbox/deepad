'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CopyButton from '@/components/CopyButton';
import { groupAccountNumber } from '@/lib/money';
import type { NoteValue } from '@/lib/wad';
import Bundle from './Bundle';
import './spray.css';

// Spraying from a guest's phone, right on the event page: type an amount (and,
// if you like, the name and comment for the big screen), get your own account
// number, and once the money lands, a bundle of cash to swipe onto the celebrant.
// This phone remembers the spray, so refreshing the page carries on where it was.

type WadInfo = {
  reference: string;
  state: 'pending' | 'paid' | 'expired';
  amountNaira: number;
  thrownNaira: number;
  accountNumber: string;
  bankName: string;
  accountName: string;
  expiresAt: string;
  name: string | null;
};

const MIN_NAIRA = 500;
const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private browsing: fine, it just won't be remembered */
  }
}

export default function PhoneSpray({
  code,
  celebrantName,
  open,
  onOpenChange,
  canStart,
}: {
  code: string;
  celebrantName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Spraying is open (live, not paused, account ready). */
  canStart: boolean;
}) {
  const storeKey = `dashpad-spray-${code}`;
  const [wad, setWad] = useState<WadInfo | null>(null);
  const [muted, setMuted] = useState(false);
  // Notes thrown but not yet confirmed by the server, by value.
  const pending = useRef<Record<string, number>>({});
  const [pendingNaira, setPendingNaira] = useState(0);
  const sending = useRef(false);

  // Notes thrown but not yet sent are kept on the phone too, so a refresh never loses them.
  const throwsKey = `${storeKey}-throws`;
  const savePending = useCallback(() => write(throwsKey, Object.keys(pending.current).length ? JSON.stringify(pending.current) : null), [throwsKey]);

  // A spray started earlier on this phone (e.g. the page was refreshed): carry on right where it was.
  useEffect(() => {
    const ref = read(storeKey);
    if (!ref) return;
    fetch(`/api/spray/${encodeURIComponent(ref)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((w: Omit<WadInfo, 'reference'> | null) => {
        if (!w || w.state === 'expired' || (w.state === 'paid' && w.amountNaira - w.thrownNaira < 100)) {
          write(storeKey, null);
          write(throwsKey, null);
          return;
        }
        try {
          const saved = JSON.parse(read(throwsKey) ?? '{}') as Record<string, number>;
          pending.current = saved;
          setPendingNaira(Object.entries(saved).reduce((s, [k, v]) => s + Number(k) * v, 0));
        } catch {
          /* nothing saved */
        }
        setWad({ ...w, reference: ref });
        onOpenChange(true);
      })
      .catch(() => {});
  }, [storeKey, throwsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Waiting for the transfer: ask every few seconds. The moment it lands, open the wad.
  useEffect(() => {
    if (!wad || wad.state !== 'pending') return;
    const id = setInterval(async () => {
      const r = await fetch(`/api/spray/${encodeURIComponent(wad.reference)}`, { cache: 'no-store' }).catch(() => null);
      const w = r && r.ok ? ((await r.json()) as Omit<WadInfo, 'reference'>) : null;
      if (!w) return;
      if (w.state !== 'pending') {
        setWad({ ...w, reference: wad.reference });
        if (w.state === 'paid') {
          navigator.vibrate?.([30, 60, 30]);
          onOpenChange(true);
        }
      }
    }, 3000);
    return () => clearInterval(id);
  }, [wad, onOpenChange]);

  // Thrown notes go to the server in small batches (the big screen shows them flying).
  const flush = useCallback(async () => {
    if (!wad || sending.current) return;
    const add = pending.current;
    if (!Object.keys(add).length) return;
    pending.current = {};
    savePending();
    sending.current = true;
    try {
      const r = await fetch(`/api/spray/${encodeURIComponent(wad.reference)}/throw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add }),
      });
      const res = r.ok ? ((await r.json()) as { thrownNaira: number }) : null;
      if (res) setWad((w) => (w ? { ...w, thrownNaira: res.thrownNaira } : w));
      else for (const [k, v] of Object.entries(add)) pending.current[k] = (pending.current[k] ?? 0) + v; // try again
    } catch {
      for (const [k, v] of Object.entries(add)) pending.current[k] = (pending.current[k] ?? 0) + v;
    } finally {
      savePending();
      sending.current = false;
      setPendingNaira(Object.entries(pending.current).reduce((s, [k, v]) => s + Number(k) * v, 0));
    }
  }, [wad, savePending]);
  useEffect(() => {
    if (wad?.state !== 'paid') return;
    const id = setInterval(flush, 300);
    return () => clearInterval(id);
  }, [wad?.state, flush]);

  const onThrow = useCallback((value: NoteValue) => {
    pending.current[value] = (pending.current[value] ?? 0) + 1;
    savePending();
    setPendingNaira((p) => p + value);
  }, [savePending]);

  const left = wad ? Math.max(0, wad.amountNaira - wad.thrownNaira - pendingNaira) : 0;
  // All thrown: let the last notes finish flying before saying so.
  const [finished, setFinished] = useState(false);
  const emptied = wad?.state === 'paid' && left < 100;
  useEffect(() => {
    if (!emptied) return setFinished(false);
    const t = setTimeout(() => setFinished(true), 1800);
    return () => clearTimeout(t);
  }, [emptied]);
  const startAgain = () => {
    write(storeKey, null);
    write(throwsKey, null);
    setWad(null);
    pending.current = {};
    setPendingNaira(0);
  };

  // Closed: a small chip to get back to a spray in progress.
  if (!open) {
    if (!wad || wad.state === 'expired' || (wad.state === 'paid' && left < 100)) return null;
    return (
      <button type="button" className="ps-chip" onClick={() => onOpenChange(true)}>
        {wad.state === 'pending' ? (
          <>
            <span className="ps-dot" aria-hidden="true" /> Waiting for your transfer…
          </>
        ) : (
          <>💸 Your bundle · {naira(left)} left</>
        )}
      </button>
    );
  }

  return (
    <div className={`ps${wad?.state === 'paid' ? ' ps-full' : ''}`} role="dialog" aria-modal="true" aria-label={`Spray ${celebrantName}`}>
      <div className="ps-backdrop" onClick={() => wad?.state !== 'paid' && onOpenChange(false)} aria-hidden="true" />
      <div className="ps-sheet">
        <div className="ps-head">
          {wad?.state === 'paid' ? (
            <div className="ps-left" aria-live="polite">
              <span className="ps-left-k">{left >= 100 ? 'Left to spray' : 'All sprayed!'}</span>
              <span className="ps-left-v">{naira(left)}</span>
              <span className="ps-left-of">of {naira(wad.amountNaira)}</span>
            </div>
          ) : (
            <h2>Spray {celebrantName}</h2>
          )}
          <div className="ps-head-btns">
            {wad?.state === 'paid' && (
              <button type="button" className="ps-icon" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Sound on' : 'Sound off'}>
                {muted ? '🔇' : '🔊'}
              </button>
            )}
            <button type="button" className="ps-icon" onClick={() => onOpenChange(false)} aria-label={wad?.state === 'paid' ? 'Back to the screen' : 'Close'}>
              ✕
            </button>
          </div>
        </div>

        {!wad || wad.state === 'expired' ? (
          <SprayForm
            code={code}
            canStart={canStart}
            expired={wad?.state === 'expired'}
            onStarted={(w) => {
              write(storeKey, w.reference);
              setWad(w);
            }}
          />
        ) : wad.state === 'pending' ? (
          <PayStep wad={wad} onCancel={startAgain} />
        ) : !finished ? (
          <>
            <Bundle amountNaira={wad.amountNaira} leftNaira={left} onThrow={onThrow} muted={muted} />
            <p className="ps-hint">
              <strong>Swipe up</strong> to spray · <strong>tap</strong> for one · <strong>hold</strong> to make it rain
            </p>
          </>
        ) : (
          <div className="ps-done">
            <div className="ps-done-big">🎉</div>
            <p>You sprayed {naira(wad.amountNaira)} on {celebrantName}. God bless you!</p>
            <div className="ps-actions">
              <button type="button" className="ps-btn" onClick={startAgain}>Spray again</button>
              <button type="button" className="ps-btn ghost" onClick={() => { startAgain(); onOpenChange(false); }}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Amount (and, folded away, the name and comment) → their own account number. */
function SprayForm({ code, canStart, expired, onStarted }: { code: string; canStart: boolean; expired: boolean; onStarted: (w: WadInfo) => void }) {
  const [amount, setAmount] = useState('');
  const [name, setName] = useState(() => read('dashpad-name') ?? '');
  const [message, setMessage] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount.replace(/\D/g, '')) || 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value < MIN_NAIRA) return setError(`The smallest spray is ${naira(MIN_NAIRA)}.`);
    setBusy(true);
    setError(null);
    write('dashpad-name', name.trim() || null);
    try {
      const r = await fetch(`/api/screen/${encodeURIComponent(code)}/spray`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountNaira: value, name, message }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Something went wrong. Please try again.');
      onStarted(json as WadInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!canStart) return <p className="ps-note">Spraying isn’t open right now. Please check back when the party is live.</p>;
  return (
    <form className="ps-form" onSubmit={submit}>
      {expired && <p className="ps-note warn">That account number has expired. Get a new one below.</p>}
      <label className="ps-field">
        <span>How much do you want to spray?</span>
        <div className="ps-amount-box">
          <span aria-hidden="true">₦</span>
          <input
            className="ps-input ps-amount-input"
            inputMode="numeric"
            autoFocus
            placeholder={`${MIN_NAIRA.toLocaleString('en-NG')} or more`}
            value={amount ? Number(amount.replace(/\D/g, '')).toLocaleString('en-NG') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
            aria-describedby="ps-min"
          />
        </div>
        <span className="ps-small" id="ps-min">The smallest spray is {naira(MIN_NAIRA)}.</span>
      </label>
      {more ? (
        <>
          <label className="ps-field">
            <span>Your name on the screen</span>
            <input className="ps-input" value={name} maxLength={24} placeholder="e.g. Uncle Tunde" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="ps-field">
            <span>A few words (optional)</span>
            <input className="ps-input" value={message} maxLength={60} placeholder="e.g. Happy married life!" onChange={(e) => setMessage(e.target.value)} />
          </label>
        </>
      ) : (
        <button type="button" className="ps-more" onClick={() => setMore(true)} aria-expanded={false}>
          <span>{name ? <>Showing as <strong>{name}</strong></> : 'Add your name and a few words'}</span>
          <span className="ps-more-hint">{name ? 'Change' : 'Optional'} ▾</span>
        </button>
      )}
      {error && <p className="ps-note warn" role="alert">{error}</p>}
      <button type="submit" className="ps-btn" disabled={busy || value < MIN_NAIRA}>
        {busy ? 'Getting your account…' : `Get my account number${value >= MIN_NAIRA ? ` for ${naira(value)}` : ''}`}
      </button>
      <p className="ps-small">You’ll get your own account number. Transfer from any bank app, then spray your bundle of cash right here.</p>
    </form>
  );
}

/** Their own account number, the exact amount, and a live wait for the money. */
function PayStep({ wad, onCancel }: { wad: WadInfo; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.floor((new Date(wad.expiresAt).getTime() - now) / 1000));
  return (
    <div className="ps-pay">
      <p className="ps-pay-lead">
        Transfer exactly <strong>{naira(wad.amountNaira)}</strong> to:
      </p>
      <div className="ps-acct">
        <span className="ps-acct-num">{groupAccountNumber(wad.accountNumber)}</span>
        <CopyButton text={wad.accountNumber} label="Copy" />
      </div>
      <dl className="ps-acct-rows">
        <dt>Bank</dt>
        <dd>{wad.bankName}</dd>
        <dt>Name</dt>
        <dd>{wad.accountName}</dd>
        <dt>Amount</dt>
        <dd>
          {naira(wad.amountNaira)} <CopyButton text={String(wad.amountNaira)} label="Copy" />
        </dd>
      </dl>
      <div className="ps-wait" role="status">
        <span className="ps-spin" aria-hidden="true" />
        <span>
          Waiting for your transfer… your bundle of cash appears here the moment it lands.
          <br />
          <span className="ps-small">This account works for {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} more.</span>
        </span>
      </div>
      <button type="button" className="ps-link" onClick={onCancel}>Start again</button>
    </div>
  );
}
