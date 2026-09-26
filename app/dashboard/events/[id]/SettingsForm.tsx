'use client';

import { useActionState, useState } from 'react';
import { RECIPIENT_CHOICES } from '@/lib/event-info';
import DateTimeField from '@/components/DateTimeField';
import SlugField from '@/components/SlugField';
import ThemePicker from '@/components/ThemePicker';
import type { ThemeColors } from '@/lib/themes';
import { saveEventSettings } from '../../../actions';

type Values = {
  slug: string;
  title: string;
  recipientLabel: string;
  theme: string;
  themeColors: ThemeColors | null;
  bigSprayNaira: number;
  endsAt: string;
  showCashlessNote: boolean;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function useSettings(eventId: string) {
  return useActionState(saveEventSettings.bind(null, eventId), null);
}

function Result({ state }: { state: { error?: string; ok?: string } | null }) {
  if (state?.error) return <p className="error-text" role="alert">{state.error}</p>;
  if (state?.ok) return <p className="ok-text" role="status">{state.ok}</p>;
  return null;
}

/** Title, "sent to", big spray amount and end time. */
export function DetailsForm({ eventId, ended, values }: { eventId: string; ended: boolean; values: Values }) {
  const [state, action, pending] = useSettings(eventId);
  const [label, setLabel] = useState(values.recipientLabel);
  const [endLocal, setEndLocal] = useState(() => toLocalInput(values.endsAt));
  const [cashless, setCashless] = useState(values.showCashlessNote);

  return (
    <form action={action} className="settings-form">
      <input type="hidden" name="recipientLabel" value={label} />
      <input type="hidden" name="showCashlessNote" value={cashless ? 'yes' : 'no'} />
      {/* Sent as a full date with time zone, so the server reads it correctly. */}
      <input type="hidden" name="endsAt" value={ended ? '' : localToIso(endLocal)} />
      <div className="settings-grid">
        <div className="field">
          <label htmlFor="s-title">Event title</label>
          <input id="s-title" name="title" className="input" defaultValue={values.title} maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor="s-big">Big spray amount (₦)</label>
          <input id="s-big" name="bigSprayNaira" className="input" inputMode="numeric" defaultValue={values.bigSprayNaira} />
          <span className="hint">A single spray this big takes over the whole screen.</span>
        </div>
        {!ended && (
          <DateTimeField id="s-end" label="Spraying ends" value={endLocal} onChange={setEndLocal} hint="Party running late? Push the end time back." />
        )}
      </div>
      <div className="field">
        <span className="field-label" id="s-label">Sprays are “sent to…”</span>
        <div className="chips" role="group" aria-labelledby="s-label">
          {Array.from(new Set([...RECIPIENT_CHOICES, values.recipientLabel])).map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={label === c} onClick={() => setLabel(c)}>{c}</button>
          ))}
        </div>
      </div>
      <CashlessToggle on={cashless} onChange={setCashless} />
      <div className="settings-foot">
        <Result state={state} />
        <button type="submit" className="btn btn-dark" disabled={pending}>{pending ? 'Saving…' : 'Save details'}</button>
      </div>
    </form>
  );
}

/** The big screen's colours. */
export function ThemeForm({ eventId, values }: { eventId: string; values: Pick<Values, 'theme' | 'themeColors' | 'recipientLabel'> }) {
  const [state, action, pending] = useSettings(eventId);
  const [theme, setTheme] = useState({ theme: values.theme, colors: values.themeColors });
  const changed = theme.theme !== values.theme || JSON.stringify(theme.colors) !== JSON.stringify(values.themeColors);

  return (
    <form action={action} className="settings-form">
      <input type="hidden" name="theme" value={theme.theme} />
      <input type="hidden" name="themeColors" value={theme.theme === 'custom' && theme.colors ? JSON.stringify(theme.colors) : ''} />
      <ThemePicker value={theme} onChange={setTheme} recipientLabel={values.recipientLabel} />
      <div className="settings-foot">
        <Result state={state} />
        <button type="submit" className="btn btn-dark" disabled={pending || !changed}>{pending ? 'Saving…' : 'Save colours'}</button>
      </div>
    </form>
  );
}

/**
 * The event link. Locked by default: changing it breaks links already shared,
 * so it takes a deliberate click and a confirmation, and only before the party starts.
 */
export function LinkForm({ eventId, slug, link, canChange }: { eventId: string; slug: string; link: string; canChange: boolean }) {
  const [state, action, pending] = useSettings(eventId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(slug);
  const [sure, setSure] = useState(false);

  if (!editing || state?.ok) {
    return (
      <div className="settings-form">
        <div className="link-locked">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span className="link-locked-url">{link}</span>
        </div>
        {state?.ok && <p className="ok-text" role="status">Link changed. Share the new one.</p>}
        {canChange ? (
          <div>
            <button type="button" className="link-btn" onClick={() => { setEditing(true); setSure(false); }}>Change link…</button>
          </div>
        ) : (
          <span className="hint">The link can’t be changed once spraying has started, so the big screen and shared links keep working.</span>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="settings-form">
      <input type="hidden" name="slug" value={value} />
      <div className="banner warn" style={{ margin: 0 }}>
        <strong>Careful:</strong> the old link will stop working. Anyone you’ve sent it to, and any screen that has it open, will need the new one.
      </div>
      <SlugField value={value} onChange={setValue} exceptEventId={eventId} />
      <label className="check-row">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span>I understand the old link will stop working</span>
      </label>
      <div className="settings-foot">
        <Result state={state} />
        <button type="button" className="btn" onClick={() => { setEditing(false); setValue(slug); }}>Cancel</button>
        <button type="submit" className="btn btn-dark" disabled={pending || !sure || value === slug}>{pending ? 'Saving…' : 'Change link'}</button>
      </div>
    </form>
  );
}

/** "No need to bring cash" on the guests' write-a-line page: on or off. */
export function CashlessToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={`switch-card${on ? ' on' : ''}`}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
      <span className="switch-text">
        <strong>Tell guests they don’t need cash</strong>
        <span className="hint">
          Shows a short note on your “write a line” page: no need to hunt for mint notes, they can spray the celebrant by transfer at the party.
        </span>
      </span>
    </label>
  );
}
