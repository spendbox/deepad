'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { MAX_LINE_LENGTH } from '@/lib/text';
import Avatar from './Avatar';

type Action = (prev: { error?: string; ok?: string } | null, form: FormData) => Promise<{ error?: string; ok?: string } | null>;

/** Shrink a photo on the phone: a small square picture is all the screen needs. */
async function shrinkPhoto(file: File, side = 480): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const crop = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(side, crop);
  canvas.getContext('2d')!.drawImage(
    bitmap,
    (bitmap.width - crop) / 2,
    (bitmap.height - crop) / 2,
    crop,
    crop,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85));
}

/**
 * Write a line for the big screen: the line, a name and an optional photo,
 * with a live preview of how it will look.
 */
export default function LineForm({
  action,
  defaultName = '',
  submitLabel = 'Send to the big screen',
  onSent,
  variant = 'card',
}: {
  action: Action;
  defaultName?: string;
  submitLabel?: string;
  onSent?: (line: { text: string; name: string; photo: string | null }) => void;
  variant?: 'card' | 'plain';
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const [text, setText] = useState('');
  const [name, setName] = useState(defaultName);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<{ text: string; name: string; photo: string | null } | null>(null);

  useEffect(() => {
    if (!state?.ok || !sentRef.current) return;
    onSent?.(sentRef.current);
    sentRef.current = null;
    setText('');
    setPhoto(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function pick(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    const small = await shrinkPhoto(file);
    if (!small) return setPhotoError('That file doesn’t look like a photo.');
    setPhoto(small);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(small);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData();
    form.set('text', text);
    form.set('name', name);
    if (photo) form.set('photo', new File([photo], 'photo.jpg', { type: 'image/jpeg' }));
    sentRef.current = { text, name, photo: preview };
    startTransition(() => dispatch(form));
  }

  const shownName = name.trim() || 'Your name';
  return (
    <form onSubmit={submit} className={`line-form ${variant}`}>
      <div className="field">
        <label htmlFor="lf-text">Your line</label>
        <textarea
          id="lf-text"
          className="input line-text"
          value={text}
          maxLength={MAX_LINE_LENGTH}
          rows={3}
          placeholder="e.g. Happy birthday my sister! More life and joy."
          onChange={(e) => setText(e.target.value)}
          required
        />
        <span className="hint" style={{ textAlign: 'right' }}>{text.length}/{MAX_LINE_LENGTH}</span>
      </div>
      <div className="field">
        <label htmlFor="lf-name">Your name</label>
        <input id="lf-name" className="input" value={name} maxLength={40} autoComplete="given-name" onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <span className="field-label">Your photo (optional)</span>
        <div className="line-photo-row">
          <Avatar name={shownName} photo={preview} size={56} />
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            {preview ? 'Change photo' : 'Add a photo'}
          </button>
          {preview && (
            <button type="button" className="link-btn" onClick={() => { setPhoto(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}>
              Remove
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <span className="hint">No photo? We’ll show the first letter of your name.</span>
        {photoError && <span className="error-text">{photoError}</span>}
      </div>

      <div className="line-preview" aria-label="Preview">
        <span className="line-preview-label">How it shows on the big screen</span>
        <div className="line-preview-head">
          <Avatar name={shownName} photo={preview} size={40} />
          <strong>{shownName}</strong>
        </div>
        <p className="line-preview-text">{text.trim() ? `“${text.trim()}”` : '“Your line will appear here.”'}</p>
      </div>

      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      <button type="submit" className="btn btn-dark btn-lg btn-block" disabled={pending || !text.trim() || !name.trim()}>
        {pending ? 'Sending…' : submitLabel}
      </button>
    </form>
  );
}
