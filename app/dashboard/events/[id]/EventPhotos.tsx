'use client';

import { useState, useTransition } from 'react';
import PhotoPicker from '@/components/PhotoPicker';
import { saveEventPhotos } from '../../../actions';

export default function EventPhotos({
  eventId,
  initial,
  canRemoveBg,
}: {
  eventId: string;
  initial: string[];
  canRemoveBg: boolean;
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
      <span className="hint" role="status">{saving ? 'Saving…' : 'Photos show on the big screen between sprays. Changes save automatically.'}</span>
    </div>
  );
}
