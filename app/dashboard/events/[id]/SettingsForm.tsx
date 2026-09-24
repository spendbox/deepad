'use client';

import { useActionState, useState } from 'react';
import { RECIPIENT_CHOICES } from '@/lib/event-info';
import SlugField from '@/components/SlugField';
import { THEMES } from '@/lib/themes';
import { DEFAULT_HYPE_LINES } from '@/lib/hype';
import { saveEventSettings } from '../../../actions';

type Values = { slug: string; hypeLines: string[]; title: string; recipientLabel: string; theme: string; bigSprayNaira: number; endsAt: string };

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export default function SettingsForm({ eventId, ended, values }: { eventId: string; ended: boolean; values: Values }) {
  const [state, action, pending] = useActionState(saveEventSettings.bind(null, eventId), null);
  const [theme, setTheme] = useState(values.theme);
  const [label, setLabel] = useState(values.recipientLabel);
  const [endLocal, setEndLocal] = useState(() => toLocalInput(values.endsAt));
  const [slug, setSlug] = useState(values.slug);

  return (
    <form action={action} className="form" style={{ marginTop: 8 }}>
      <input type="hidden" name="theme" value={theme} />
      <input type="hidden" name="recipientLabel" value={label} />
      {/* Sent as a full date with time zone, so the server reads it correctly. */}
      <input type="hidden" name="endsAt" value={ended ? '' : localToIso(endLocal)} />
      <input type="hidden" name="slug" value={slug} />
      <SlugField value={slug} onChange={setSlug} exceptEventId={eventId} />
      {slug !== values.slug && (
        <p className="banner warn" style={{ margin: 0 }}>
          The old link will stop working. If you’ve already shared it, share the new one.
        </p>
      )}
      <div className="field">
        <label htmlFor="s-title">Event title</label>
        <input id="s-title" name="title" className="input" defaultValue={values.title} maxLength={40} />
      </div>
      <div className="field">
        <span className="field-label" id="s-label">Sprays are “sent to…”</span>
        <div className="chips" role="group" aria-labelledby="s-label">
          {Array.from(new Set([...RECIPIENT_CHOICES, values.recipientLabel])).map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={label === c} onClick={() => setLabel(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="s-theme">Theme</label>
        <select id="s-theme" className="select" value={theme} onChange={(e) => setTheme(e.target.value)}>
          {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="s-hype">Lines for sprays without a message</label>
        <textarea
          id="s-hype"
          name="hypeLines"
          className="input"
          style={{ height: 'auto', minHeight: 180, padding: 12, lineHeight: 1.5 }}
          defaultValue={values.hypeLines.join('\n')}
          placeholder={DEFAULT_HYPE_LINES.join('\n')}
        />
        <span className="hint">
          One per line. When a spray arrives without a message, the screen shows one of these. Leave empty to use ours
          (shown in grey). Write {'{name}'} for the celebrant’s name.
        </span>
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
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      {state?.ok && <p className="ok-text" role="status">{state.ok}</p>}
      <button type="submit" className="btn btn-dark" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</button>
    </form>
  );
}
