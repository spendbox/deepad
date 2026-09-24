'use client';

import { useEffect, useId, useState } from 'react';
import BankCombobox from './BankCombobox';

export type BankAccount = { bankCode: string; bankName: string; accountNumber: string; accountName: string };

type Bank = { name: string; code: string };

let banksCache: Promise<{ banks: Bank[] }> | null = null;
function loadBanks() {
  banksCache ??= fetch('/api/banks')
    .then((r) => r.json())
    .catch(() => ({ banks: [] }));
  return banksCache;
}

/**
 * Bank + account number. When Paystack is connected, the name on the account
 * is looked up automatically so people can see they typed it right.
 * With `namePrefix` it also renders hidden inputs so it works inside a <form>.
 */
export default function BankAccountFields({
  value,
  onChange,
  namePrefix,
  label = 'Bank',
}: {
  value: BankAccount;
  onChange: (v: BankAccount) => void;
  namePrefix?: string;
  label?: string;
}) {
  const id = useId();
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    loadBanks().then((r) => setBanks(r.banks ?? []));
  }, []);

  const manual = banks !== null && banks.length === 0;

  // Look up the account name once we have a bank and 10 digits.
  useEffect(() => {
    if (manual || !value.bankCode || value.accountNumber.length !== 10) return;
    let cancelled = false;
    setLooking(true);
    setLookupError(null);
    fetch(`/api/banks/resolve?account=${value.accountNumber}&bank=${encodeURIComponent(value.bankCode)}`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && json.accountName) onChange({ ...value, accountName: json.accountName });
        else {
          setLookupError(json.error ?? 'We could not check that account.');
          onChange({ ...value, accountName: '' });
        }
      })
      .catch(() => !cancelled && setLookupError('We could not check that account. Check your internet.'))
      .finally(() => !cancelled && setLooking(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.bankCode, value.accountNumber, manual]);

  return (
    <div className="stack" style={{ gap: 14 }}>
      {namePrefix !== undefined && (
        <>
          <input type="hidden" name={`${namePrefix}bankCode`} value={value.bankCode} />
          <input type="hidden" name={`${namePrefix}bankName`} value={value.bankName} />
          <input type="hidden" name={`${namePrefix}accountNumber`} value={value.accountNumber} />
          <input type="hidden" name={`${namePrefix}accountName`} value={value.accountName} />
        </>
      )}
      {manual ? (
        <div className="field">
          <label htmlFor={`${id}-bank`}>{label}</label>
          <input
            id={`${id}-bank`}
            className="input"
            placeholder="e.g. GTBank"
            value={value.bankName}
            onChange={(e) => onChange({ ...value, bankName: e.target.value, bankCode: '' })}
          />
        </div>
      ) : (
        <BankCombobox
          banks={banks ?? []}
          disabled={banks === null}
          label={label}
          value={{ code: value.bankCode, name: value.bankName }}
          onChange={(b) => onChange({ ...value, bankCode: b?.code ?? '', bankName: b?.name ?? '', accountName: '' })}
        />
      )}
      <div className="field">
        <label htmlFor={`${id}-acct`}>Account number</label>
        <input
          id={`${id}-acct`}
          className="input tabular"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder="10 digits"
          value={value.accountNumber}
          onChange={(e) =>
            onChange({ ...value, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 10), accountName: manual ? value.accountName : '' })
          }
        />
      </div>
      {manual ? (
        <div className="field">
          <label htmlFor={`${id}-name`}>Name on the account</label>
          <input id={`${id}-name`} className="input" value={value.accountName} onChange={(e) => onChange({ ...value, accountName: e.target.value })} />
        </div>
      ) : looking ? (
        <p className="hint" role="status">Checking account…</p>
      ) : value.accountName ? (
        <div className="resolved" role="status">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
          {value.accountName}
        </div>
      ) : lookupError ? (
        <p className="error-text" role="alert">{lookupError}</p>
      ) : null}
    </div>
  );
}
