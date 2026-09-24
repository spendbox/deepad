'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { naira } from '@/lib/money';
import { MAX_MESSAGE_LENGTH } from '@/lib/text';

const PRESETS = [1000, 2000, 5000, 10000, 20000, 50000];

export default function MessageSprayForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [picked, setPicked] = useState<number | 'other'>(5000);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = picked === 'other' ? Math.floor(Number(other.replace(/\D/g, '')) || 0) : picked;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!message.trim()) return setError('Please type your message.');
    if (amount < 100) return setError('The smallest spray is ₦100.');
    setBusy(true);
    try {
      const res = await fetch(`/api/spray/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, amountNaira: amount }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.reference) throw new Error(json.error ?? 'Something went wrong. Please try again.');
      router.push(`/${encodeURIComponent(slug)}/spray/${encodeURIComponent(json.reference)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <form className="g-card" onSubmit={submit} noValidate>
      <label className="g-label" htmlFor="g-message">Your message</label>
      <textarea
        id="g-message"
        className="g-input"
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder="e.g. Happy married life! Dance well o!"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <span className="g-hint">{MAX_MESSAGE_LENGTH - message.length} characters left</span>

      <span className="g-label" id="g-amount-label">Amount</span>
      <div className="g-amounts" role="group" aria-labelledby="g-amount-label">
        {PRESETS.map((v) => (
          <button key={v} type="button" className="g-amount" aria-pressed={picked === v} onClick={() => setPicked(v)}>
            {naira(v * 100)}
          </button>
        ))}
      </div>
      <button type="button" className="g-amount" aria-pressed={picked === 'other'} onClick={() => setPicked('other')}>
        Other amount
      </button>
      {picked === 'other' && (
        <input
          className="g-input"
          inputMode="numeric"
          aria-label="Other amount in naira"
          placeholder="Amount in ₦"
          value={other}
          onChange={(e) => setOther(e.target.value.replace(/[^\d,]/g, ''))}
          autoFocus
        />
      )}

      {error && <p className="g-error" role="alert">{error}</p>}
      <button type="submit" className="g-btn" disabled={busy}>
        {busy ? 'Getting your account number…' : `Spray ${amount >= 100 ? naira(amount * 100) : ''}`}
      </button>
    </form>
  );
}
