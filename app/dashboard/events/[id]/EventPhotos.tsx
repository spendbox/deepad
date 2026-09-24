'use client';

import { useState, useTransition } from 'react';
import PhotoPicker from '@/components/PhotoPicker';
import { saveEventPhotos } from '../../../actions';

export default function EventPhotos({ eventId, initial }: { eventId: string; initial: string[] }) {
  const [photos, setPhotos] = useState(initial);
  const [saving, start] = useTransition();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <PhotoPicker
        value={photos}
        onChange={(next) => {
          setPhotos(next);
          start(async () => {
            await saveEventPhotos(eventId, next);
          });
        }}
      />
      <span className="hint" role="status">{saving ? 'Saving…' : 'Photos show on the big screen between sprays.'}</span>
    </div>
  );
}
