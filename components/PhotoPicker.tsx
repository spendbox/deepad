'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadCelebrantPhoto } from '@/app/actions';
import { isCutout } from '@/lib/photos';

export const MAX_PHOTOS = 6;

/** Shrink a phone photo before uploading, so it's quick even on slow data. */
function shrink(bitmap: ImageBitmap, maxSide = 1600): Promise<Blob | null> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85));
}

type Job = { id: number; status: string };
const PREF_KEY = 'dashpad:remove-bg';

export default function PhotoPicker({
  value,
  onChange,
  canRemoveBg = false,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  /** Background removal (Photoroom) is set up. */
  canRemoveBg?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const cutting = canRemoveBg && removeBg;

  useEffect(() => {
    try {
      if (localStorage.getItem(PREF_KEY) === '0') setRemoveBg(false);
    } catch {}
  }, []);

  function toggle(on: boolean) {
    setRemoveBg(on);
    try {
      localStorage.setItem(PREF_KEY, on ? '1' : '0');
    } catch {}
  }

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setNote(null);
    const room = MAX_PHOTOS - value.length - jobs.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) setError(`You can add up to ${MAX_PHOTOS} photos.`);
    const mine = picked.map((_, i) => ({ id: Date.now() + i, status: cutting ? 'Removing background…' : 'Uploading…' }));
    setJobs((js) => [...js, ...mine]);
    let urls = [...value];
    for (const [i, file] of picked.entries()) {
      const job = mine[i];
      try {
        const bitmap = await createImageBitmap(file).catch(() => null);
        if (!bitmap) {
          setError('That file doesn’t look like a photo. Please use a JPG, PNG or WebP.');
          continue;
        }
        const blob = await shrink(bitmap);
        bitmap.close();
        if (!blob) throw new Error('no image');
        const form = new FormData();
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
        form.append('photo', new File([blob], `photo.${ext}`, { type: blob.type || 'image/jpeg' }));
        if (cutting) form.append('removeBg', '1');
        const res = await uploadCelebrantPhoto(form);
        if ('error' in res) setError(res.error);
        else {
          if (res.note) setNote(res.note);
          urls = [...urls, res.url];
          onChange(urls);
        }
      } catch {
        setError('A photo could not be uploaded. Check your internet and try again.');
      } finally {
        setJobs((js) => js.filter((j) => j.id !== job.id));
      }
    }
    if (input.current) input.current.value = '';
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      {canRemoveBg && (
        <label className="switch-row">
          <input type="checkbox" className="switch" checked={removeBg} onChange={(e) => toggle(e.target.checked)} />
          <span>
            <strong>Remove backgrounds</strong>
            <span className="hint" style={{ display: 'block' }}>
              Cuts out the people so they can dance on the big screen and catch the money. Use clear photos where
              everyone is fully in the picture.
            </span>
          </span>
        </label>
      )}
      <div className="photo-grid">
        {value.map((url, i) => (
          <div key={url} className={`photo-tile${isCutout(url) ? ' cutout' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Celebrant photo ${i + 1}`} />
            <button type="button" className="photo-remove" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(value.filter((u) => u !== url))}>
              ×
            </button>
          </div>
        ))}
        {jobs.map((j) => (
          <div key={j.id} className="photo-tile photo-busy" role="status">
            <span className="spinner" aria-hidden="true" />
            {j.status}
          </div>
        ))}
        {value.length + jobs.length < MAX_PHOTOS && (
          <button type="button" className="photo-add" onClick={() => input.current?.click()}>
            <span aria-hidden="true" style={{ fontSize: 28, lineHeight: 1 }}>+</span>
            Add photo
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} />
      {note && <p className="hint" role="status">{note}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
