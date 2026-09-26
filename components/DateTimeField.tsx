'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

// One date-and-time picker for the whole app: the date as dd/mm/yyyy (type it,
// or pick it from a calendar), and the time as hour, minute and AM/PM.
// The value is the same as a datetime-local input's: "2026-09-26T19:30",
// in the device's own time zone.

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

type Parts = { y: number; m: number; d: number; h: number; min: number }; // m: 1-12, h: 0-23

function parse(value: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  return m ? { y: +m[1], m: +m[2], d: +m[3], h: +m[4], min: +m[5] } : null;
}
function build(p: Parts): string {
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}
function ddmmyyyy(p: Parts | null): string {
  return p ? `${pad(p.d)}/${pad(p.m)}/${p.y}` : '';
}
function validDate(y: number, m: number, d: number) {
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}
function dayKey(y: number, m: number, d: number) {
  return y * 10000 + m * 100 + d;
}

export default function DateTimeField({
  id,
  label,
  value,
  onChange,
  min,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest allowed (same format as value); earlier days are greyed out in the calendar. */
  min?: string;
  hint?: React.ReactNode;
}) {
  const p = parse(value);
  const minP = min ? parse(min) : null;
  const [text, setText] = useState(ddmmyyyy(p));
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => ({ y: p?.y ?? new Date().getFullYear(), m: p?.m ?? new Date().getMonth() + 1 }));
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();

  // Keep the typed date in step when the value changes from outside (e.g. "Quick length").
  useEffect(() => {
    setText(ddmmyyyy(p));
    if (p) setView({ y: p.y, m: p.m });
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const setDate = (y: number, m: number, d: number) => {
    const base = p ?? { y, m, d, h: 18, min: 0 };
    onChange(build({ ...base, y, m, d }));
  };
  const setTime = (h: number, minute: number) => {
    const now = new Date();
    const base = p ?? { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(), h, min: minute };
    onChange(build({ ...base, h, min: minute }));
  };

  // Typing the date: the slashes go in by themselves.
  const typed = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const shown = digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}` : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    setText(shown);
    if (digits.length === 8) {
      const d = +digits.slice(0, 2);
      const m = +digits.slice(2, 4);
      const y = +digits.slice(4);
      if (validDate(y, m, d)) setDate(y, m, d);
    }
  };

  const hour12 = p ? ((p.h + 11) % 12) + 1 : 6;
  const pm = p ? p.h >= 12 : true;
  const minutes = useMemo(() => {
    const list = Array.from({ length: 12 }, (_, i) => i * 5);
    if (p && !list.includes(p.min)) list.push(p.min);
    return list.sort((a, b) => a - b);
  }, [p?.min]); // eslint-disable-line react-hooks/exhaustive-deps
  const to24 = (h12: number, isPm: boolean) => (h12 % 12) + (isPm ? 12 : 0);

  // The calendar grid for the month on view, Monday first.
  const first = new Date(view.y, view.m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(view.y, view.m, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const today = new Date();
  const todayKey = dayKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const minKey = minP ? dayKey(minP.y, minP.m, minP.d) : 0;
  const shift = (by: number) => setView((v) => {
    const t = new Date(v.y, v.m - 1 + by, 1);
    return { y: t.getFullYear(), m: t.getMonth() + 1 };
  });

  const readable = p
    ? new Date(p.y, p.m - 1, p.d, p.h, p.min).toLocaleString('en-NG', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
      }).replace(/\bam\b/, 'AM').replace(/\bpm\b/, 'PM')
    : null;

  return (
    <div className="field dtf" ref={box}>
      <label htmlFor={id}>{label}</label>
      <div className="dtf-row">
        <div className="dtf-date">
          <input
            id={id}
            className="input"
            inputMode="numeric"
            placeholder="dd/mm/yyyy"
            autoComplete="off"
            value={text}
            onChange={(e) => typed(e.target.value)}
            onBlur={() => setText(ddmmyyyy(parse(value)))}
            aria-describedby={`${uid}-read`}
          />
          <button type="button" className="dtf-cal-btn" aria-label="Choose a date" aria-expanded={open} onClick={() => setOpen(!open)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
          </button>
          {open && (
            <div className="dtf-cal" role="dialog" aria-label="Choose a date">
              <div className="dtf-cal-head">
                <button type="button" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
                <strong>{MONTHS[view.m - 1]} {view.y}</strong>
                <button type="button" onClick={() => shift(1)} aria-label="Next month">›</button>
              </div>
              <div className="dtf-cal-grid">
                {DAYS.map((d) => <span key={d} className="dtf-dow">{d}</span>)}
                {cells.map((d, i) => {
                  if (!d) return <span key={`e${i}`} />;
                  const key = dayKey(view.y, view.m, d);
                  const chosen = p && key === dayKey(p.y, p.m, p.d);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`dtf-day${chosen ? ' on' : ''}${key === todayKey ? ' today' : ''}`}
                      disabled={!!minKey && key < minKey}
                      onClick={() => {
                        setDate(view.y, view.m, d);
                        setOpen(false);
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="dtf-time" role="group" aria-label={`${label}: time`}>
          <select className="dtf-sel" aria-label="Hour" value={hour12} onChange={(e) => setTime(to24(+e.target.value, pm), p?.min ?? 0)}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="dtf-colon" aria-hidden="true">:</span>
          <select className="dtf-sel" aria-label="Minutes" value={p?.min ?? 0} onChange={(e) => setTime(p?.h ?? 18, +e.target.value)}>
            {minutes.map((m) => <option key={m} value={m}>{pad(m)}</option>)}
          </select>
          <div className="dtf-ampm" role="group" aria-label="AM or PM">
            <button type="button" aria-pressed={!pm} onClick={() => setTime(to24(hour12, false), p?.min ?? 0)}>AM</button>
            <button type="button" aria-pressed={pm} onClick={() => setTime(to24(hour12, true), p?.min ?? 0)}>PM</button>
          </div>
        </div>
      </div>
      <span id={`${uid}-read`} className="dtf-read">{readable ?? 'Pick a date and time'}</span>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
