'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

type Bank = { name: string; code: string };

// Short names people actually type.
const ALIASES: Record<string, string[]> = {
  gtb: ['guaranty trust'],
  gtbank: ['guaranty trust'],
  uba: ['united bank for africa'],
  fcmb: ['first city monument'],
  fbn: ['first bank'],
  firstbank: ['first bank'],
  stanbic: ['stanbic ibtc'],
  moniepoint: ['moniepoint'],
  opay: ['opay', 'paycom'],
  palmpay: ['palmpay'],
};

function matches(bank: Bank, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const name = bank.name.toLowerCase();
  if (name.startsWith(q)) return 3;
  if (name.split(/[\s()-]+/).some((w) => w.startsWith(q))) return 2;
  if (name.includes(q)) return 1;
  for (const [alias, targets] of Object.entries(ALIASES)) {
    if (alias.startsWith(q.replace(/\s/g, '')) && targets.some((t) => name.includes(t))) return 2;
  }
  return 0;
}

/** Type to search the bank list, then pick with a tap, the arrow keys or Enter. */
export default function BankCombobox({
  banks,
  value,
  onChange,
  label,
  disabled,
}: {
  banks: Bank[];
  value: { code: string; name: string };
  onChange: (bank: Bank | null) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState(value.name);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Show the chosen bank's name, but never wipe what the person is typing.
  useEffect(() => {
    if (value.code) setQuery(value.name);
  }, [value.code, value.name]);

  const results = useMemo(() => {
    const q = open && query !== value.name ? query : '';
    return banks
      .map((b) => ({ b, score: matches(b, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.b.name.localeCompare(b.b.name))
      .map((r) => r.b)
      .slice(0, 60);
  }, [banks, query, open, value.name]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(b: Bank) {
    onChange(b);
    setQuery(b.name);
    setOpen(false);
  }

  return (
    <div className="field combo">
      <label htmlFor={`${id}-input`}>{label}</label>
      <div className="combo-wrap">
        <input
          id={`${id}-input`}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          placeholder={disabled ? 'Loading banks…' : 'Type to search, e.g. GTBank'}
          disabled={disabled}
          value={query}
          onFocus={(e) => {
            setOpen(true);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value.code) onChange(null);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && open && results[active]) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        <svg className="combo-caret" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {open && !disabled && (
        <ul id={`${id}-list`} role="listbox" className="combo-list" ref={listRef}>
          {results.length === 0 ? (
            <li className="combo-empty">No bank matches “{query}”</li>
          ) : (
            results.map((b, i) => (
              <li
                key={b.code}
                id={`${id}-opt-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                className={b.code === value.code ? 'chosen' : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(b);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {b.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
