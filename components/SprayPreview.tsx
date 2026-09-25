'use client';

import { useState } from 'react';
import { isCutout } from '@/lib/photos';
import Celebrant from './Celebrant';

/** A small preview of how a spray looks with the cut-out celebrant. */
export default function SprayPreview({ photos, bg = '#1F0A26', glow = '#F2B437' }: { photos: string[]; bg?: string; glow?: string }) {
  const cutouts = photos.filter(isCutout);
  const [spray, setSpray] = useState(0);
  if (!cutouts.length) return null;

  return (
    <div className="dance-picker">
      <div className="dance-preview" style={{ background: bg, '--s-accent': glow } as React.CSSProperties}>
        <Celebrant src={cutouts[0]} width={190} height={250} sprayKey={spray} pile={spray} notes={8} />
      </div>
      <div className="dance-side">
        <span className="field-label">How a spray looks</span>
        <span className="hint">On every spray, money rains down: they grab some and the rest piles up at their feet.</span>
        <button type="button" className="btn btn-sm" onClick={() => setSpray((n) => n + 1)}>
          Test a spray 💸
        </button>
      </div>
    </div>
  );
}
