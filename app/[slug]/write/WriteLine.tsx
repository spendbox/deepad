'use client';

import { useState } from 'react';
import Avatar from '@/components/Avatar';
import LineForm from '@/components/LineForm';

type Action = (prev: { error?: string; ok?: string } | null, form: FormData) => Promise<{ error?: string; ok?: string } | null>;

/** The guest's form, then a thank-you showing the line they sent. */
export default function WriteLine({ action, celebrantName }: { action: Action; celebrantName: string }) {
  const [sent, setSent] = useState<{ text: string; name: string; photo: string | null } | null>(null);

  if (sent) {
    return (
      <div className="wl-done" role="status">
        <div className="wl-check" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
        </div>
        <h2>Sent! Watch the big screen</h2>
        <p className="hint">Your line joins the others and takes its turn on the screen.</p>
        <div className="line-preview">
          <div className="line-preview-head">
            <Avatar name={sent.name} photo={sent.photo} size={40} />
            <strong>{sent.name}</strong>
          </div>
          <p className="line-preview-text">“{sent.text}”</p>
        </div>
        <button type="button" className="btn btn-block" onClick={() => setSent(null)}>Write another line</button>
      </div>
    );
  }
  return <LineForm action={action} submitLabel={`Send to ${celebrantName}’s big screen`} onSent={setSent} variant="plain" />;
}
