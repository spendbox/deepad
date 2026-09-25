'use client';

import { useState, useTransition } from 'react';
import PhotoPicker from '@/components/PhotoPicker';
import SprayPreview from '@/components/SprayPreview';
import { saveEventPhotos } from '../../../actions';

export default function EventPhotos({
  eventId,
  initial,
  canRemoveBg,
  bg,
  glow,
}: {
  eventId: string;
  initial: string[];
  canRemoveBg: boolean;
  bg: string;
  glow: string;
}) {
  const [photos, setPhotos] = useState(initial);
  const [saving, start] = useTransition();
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PhotoPicker
        value={photos}
        canRemoveBg={canRemoveBg}
        onChange={(next) => {
          setPhotos(next);
          start(async () => {
            await saveEventPhotos(eventId, next);
          });
        }}
      />
      <SprayPreview photos={photos} bg={bg} glow={glow} />
      <span className="hint" role="status">{saving ? 'Saving…' : 'Photos show on the big screen between sprays. Changes save automatically.'}</span>
    </div>
  );
}
