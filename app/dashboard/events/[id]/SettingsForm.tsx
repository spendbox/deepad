'use client';

import { useActionState, useState } from 'react';
import { RECIPIENT_CHOICES } from '@/lib/event-info';
import SlugField from '@/components/SlugField';
import ThemePicker from '@/components/ThemePicker';
import type { ThemeColors } from '@/lib/themes';
import { DEFAULT_HYPE_LINES } from '@/lib/hype';
import { saveEventSettings } from '../../../actions';

type Values = { slug: string; hypeLines: string[]; title: string; recipientLabel: string; theme: string; themeColors: ThemeColors | null; bigSprayNaira: number; endsAt: string };

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

  return (
    <form action={action} className="settings-form">
      <input type="hidden" name="recipientLabel" value={label} />
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
          <div className="field">
            <label htmlFor="s-end">Spraying ends</label>
            <input id="s-end" type="datetime-local" className="input" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} />
            <span className="hint">Party running late? Push the end time back.</span>
          </div>
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

/** Fun lines for sprays without a message. */
export function HypeForm({ eventId, hypeLines }: { eventId: string; hypeLines: string[] }) {
  const [state, action, pending] = useSettings(eventId);
  return (
    <form action={action} className="settings-form">
      <textarea
        id="s-hype"
        name="hypeLines"
        aria-label="Lines for sprays without a message"
        className="input"
        style={{ height: 'auto', minHeight: 180, padding: 12, lineHeight: 1.5 }}
        defaultValue={hypeLines.join('\n')}
        placeholder={DEFAULT_HYPE_LINES.join('\n')}
      />
      <span className="hint">
        One per line. Leave empty to use ours (shown in grey). Write {'{name}'} for the celebrant’s name.
      </span>
      <div className="settings-foot">
        <Result state={state} />
        <button type="submit" className="btn btn-dark" disabled={pending}>{pending ? 'Saving…' : 'Save lines'}</button>
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
