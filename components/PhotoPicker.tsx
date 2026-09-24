'use client';

import { useRef, useState } from 'react';
import { uploadCelebrantPhoto } from '@/app/actions';

export const MAX_PHOTOS = 6;

/** Shrink a phone photo before uploading, so it's quick even on slow data. */
async function shrink(file: File, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
}

export default function PhotoPicker({ value, onChange }: { value: string[]; onChange: (urls: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = MAX_PHOTOS - value.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setError(`You can add up to ${MAX_PHOTOS} photos.`);
    let urls = [...value];
    setBusy(picked.length);
    for (const file of picked) {
      try {
        const blob = await shrink(file);
        const form = new FormData();
        form.append('photo', new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
        const res = await uploadCelebrantPhoto(form);
        if ('error' in res) setError(res.error);
        else {
          urls = [...urls, res.url];
          onChange(urls);
        }
      } catch {
        setError('A photo could not be uploaded. Check your internet and try again.');
      }
      setBusy((n) => n - 1);
    }
    if (input.current) input.current.value = '';
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="photo-grid">
        {value.map((url, i) => (
          <div key={url} className="photo-tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Celebrant photo ${i + 1}`} />
            <button type="button" className="photo-remove" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(value.filter((u) => u !== url))}>
              ×
            </button>
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <div key={`busy-${i}`} className="photo-tile photo-busy" role="status">Uploading…</div>
        ))}
        {value.length + busy < MAX_PHOTOS && (
          <button type="button" className="photo-add" onClick={() => input.current?.click()}>
            <span aria-hidden="true" style={{ fontSize: 28, lineHeight: 1 }}>+</span>
            Add photo
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} />
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
