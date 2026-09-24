'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { feesOnTop, groupAccountNumber, MIN_SPRAY_NAIRA, naira, PRESET_AMOUNTS_NAIRA, type FeeSettings } from '@/lib/money';
import { MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH } from '@/lib/text';
import CopyButton from '@/components/CopyButton';

type Props = {
  slug: string;
  celebrants: string;
  fees: FeeSettings;
  direct: { number: string; bank: string | null; name: string | null } | null;
};

const NAME_KEY = 'dashpad:name';

export default function SprayForm({ slug, celebrants, fees, direct }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<number | 'other'>(20000);
  const [other, setOther] = useState('');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardNote, setCardNote] = useState(false);

  // Guests often spray many times: remember their name on this phone.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) setName(saved);
    } catch {}
  }, []);

  const amountNaira = picked === 'other' ? Math.floor(Number(other.replace(/[^\d]/g, '')) || 0) : picked;
  const breakdown = feesOnTop(amountNaira * 100, fees);
  const valid = name.trim().length >= 2 && amountNaira >= MIN_SPRAY_NAIRA;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Please enter your name.');
    if (amountNaira < MIN_SPRAY_NAIRA) return setError(`The smallest spray is ${naira(MIN_SPRAY_NAIRA * 100)}.`);
    setBusy(true);
    try {
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {}
      const res = await fetch(`/api/events/${encodeURIComponent(slug)}/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, amountNaira, message, anonymous }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.reference) throw new Error(json.error ?? 'Something went wrong. Please try again.');
      router.push(`/s/${encodeURIComponent(slug)}/pay/${encodeURIComponent(json.reference)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <form className="phone-body" onSubmit={pay} noValidate>
      <div className="field">
        <label htmlFor="spray-name">Name on screen</label>
        <input
          id="spray-name"
          className="input"
          type="text"
          autoComplete="name"
          maxLength={MAX_NAME_LENGTH}
          placeholder="e.g. Funmi in London"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <div className="field-label" id="amount-label">Amount</div>
        <div className="amounts" role="group" aria-labelledby="amount-label">
          {PRESET_AMOUNTS_NAIRA.map((v) => (
            <button
              key={v}
              type="button"
              className="amount-btn"
              aria-pressed={picked === v}
              onClick={() => setPicked(v)}
            >
              {naira(v * 100)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="amount-btn"
          aria-pressed={picked === 'other'}
          onClick={() => setPicked('other')}
          style={{ fontSize: 16 }}
        >
          Other amount
        </button>
        {picked === 'other' && (
          <input
            className="input"
            inputMode="numeric"
            aria-label="Other amount in naira"
            placeholder="Amount in ₦"
            value={other}
            onChange={(e) => setOther(e.target.value.replace(/[^\d,]/g, ''))}
            autoFocus
          />
        )}
      </div>

      <div className="field">
        <label htmlFor="spray-message">Message (optional)</label>
        <input
          id="spray-message"
          className="input"
          type="text"
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="e.g. Dance well o!"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <span className="hint">{MAX_MESSAGE_LENGTH - message.length} characters left</span>
      </div>

      <div className="toggle-row">
        <label htmlFor="spray-anon">
          Hide my name on screen
          <span className="hint">
            {anonymous
              ? `Shows as "Anonymous guest". ${celebrants} will still see your name in their private report.`
              : 'Your name shows on the big screen.'}
          </span>
        </label>
        <span className="switch">
          <input id="spray-anon" type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          <span aria-hidden="true" />
        </span>
      </div>

      <div className="card" aria-live="polite">
        <div className="row">
          <span>Spray</span>
          <strong>{naira(breakdown.sprayKobo)}</strong>
        </div>
        <div className="row">
          <span>Service fee (paid by you)</span>
          <strong>{naira(breakdown.feeKobo)}</strong>
        </div>
        <div className="row total">
          <span>You send</span>
          <strong>{naira(breakdown.totalKobo)}</strong>
        </div>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      <button type="submit" className="btn-primary" disabled={busy || !valid}>
        {busy ? 'Getting your account number…' : `Pay ${naira(breakdown.sprayKobo)} by transfer`}
      </button>

      <button type="button" className="btn-link" onClick={() => setCardNote((v) => !v)} aria-expanded={cardNote}>
        Abroad? Pay by card
      </button>
      {cardNote && (
        <p className="hint" style={{ textAlign: 'center', marginTop: -8 }}>
          Card payments are coming soon. For now, please pay by bank transfer.
        </p>
      )}

      {direct && (
        <div className="direct-card">
          <span className="label">In a hurry? Transfer any amount straight to</span>
          <div className="split-row">
            <span className="acct tabular">{groupAccountNumber(direct.number)}</span>
            <CopyButton text={direct.number} dark />
          </div>
          <span>{[direct.bank, direct.name].filter(Boolean).join(' · ')}</span>
          <span className="label">Direct transfers show your bank account name and your transfer description on screen.</span>
        </div>
      )}
    </form>
  );
}
