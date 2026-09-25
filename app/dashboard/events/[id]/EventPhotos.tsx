'use client';

import { useState, useTransition } from 'react';
import DancePicker from '@/components/DancePicker';
import PhotoPicker from '@/components/PhotoPicker';
import type { DanceStyle } from '@/lib/dance';
import { saveEventPhotos, saveEventSettings } from '../../../actions';

export default function EventPhotos({
  eventId,
  initial,
  dance,
  canRemoveBg,
  bg,
  glow,
}: {
  eventId: string;
  initial: string[];
  dance: DanceStyle;
  canRemoveBg: boolean;
  bg: string;
  glow: string;
}) {
  const [photos, setPhotos] = useState(initial);
  const [style, setStyle] = useState(dance);
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
      <DancePicker
        photos={photos}
        value={style}
        bg={bg}
        glow={glow}
        onChange={(next) => {
          setStyle(next);
          const form = new FormData();
          form.set('danceStyle', next);
          start(async () => {
            await saveEventSettings(eventId, null, form);
          });
        }}
      />
      <span className="hint" role="status">{saving ? 'Saving…' : 'Photos show on the big screen between sprays. Changes save automatically.'}</span>
    </div>
  );
}
