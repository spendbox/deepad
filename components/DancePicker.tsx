'use client';

import { useState } from 'react';
import { DANCE_STYLES, type DanceStyle } from '@/lib/dance';
import { isCutout } from '@/lib/photos';
import Celebrant from './Celebrant';

/** Choose how the cut-out celebrant dances, with a live preview. */
export default function DancePicker({
  photos,
  value,
  onChange,
  bg = '#1F0A26',
  glow = '#F2B437',
}: {
  photos: string[];
  value: DanceStyle;
  onChange: (v: DanceStyle) => void;
  bg?: string;
  glow?: string;
}) {
  const cutouts = photos.filter(isCutout);
  const [spray, setSpray] = useState(0);
  if (!cutouts.length) return null;

  return (
    <div className="dance-picker">
      <div className="dance-preview" style={{ background: bg, '--s-accent': glow } as React.CSSProperties}>
        <Celebrant src={cutouts[0]} dance={value} width={190} height={250} sprayKey={spray} pile={spray} notes={8} />
      </div>
      <div className="dance-side">
        <span className="field-label" id="dance-label">How should they dance?</span>
        <div className="dance-options" role="group" aria-labelledby="dance-label">
          {DANCE_STYLES.map((d) => (
            <button key={d.id} type="button" className="dance-opt" aria-pressed={value === d.id} onClick={() => onChange(d.id)}>
              <strong>{d.name}</strong>
              <span>{d.hint}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setSpray((n) => n + 1)}>
          Test a spray 💸
        </button>
        <span className="hint">On every spray, money rains down: they grab some and the rest piles up at their feet.</span>
      </div>
    </div>
  );
}
