'use client';

import './celebrant.css';

const PILE_MAX = 14;

/**
 * The celebrant's cut-out photo, standing on the screen. When a spray lands (`sprayKey`
 * changes), naira notes rain down: some are grabbed (they fly into the
 * celebrant's hands, who jumps for joy) and the rest land in a pile at
 * their feet that grows through the night (`pile`).
 */
export default function Celebrant({
  src,
  width,
  height,
  sprayKey = 0,
  pile = 0,
  notes = 10,
  className = '',
}: {
  src: string;
  width: number;
  height: number;
  /** Changes on every spray, which replays the falling money. 0 = no spray. */
  sprayKey?: number;
  /** How many notes lie at their feet. */
  pile?: number;
  /** How many notes fall per spray. */
  notes?: number;
  className?: string;
}) {
  const noteW = Math.round(width * 0.2);
  const noteH = Math.round(noteW * 0.5);
  // Where the hands roughly are in a cropped standing photo.
  const handX = width * 0.5 - noteW / 2;
  const handY = height * 0.56;

  const falling = sprayKey
    ? Array.from({ length: notes }, (_, i) => {
        const grab = i % 2 === 0;
        const startX = ((i * 47 + sprayKey * 31) % 140) / 100 - 0.2; // -20%..120% of the width
        const endX = grab ? handX : width * (0.08 + (((i * 29 + sprayKey * 13) % 70) / 100));
        const endY = grab ? handY : height - noteH * 0.9;
        return {
          grab,
          style: {
            width: noteW,
            height: noteH,
            fontSize: noteH * 0.55,
            '--x0': `${startX * width}px`,
            '--y0': `${-height * 0.45 - (i % 3) * noteH}px`,
            '--x1': `${endX}px`,
            '--y1': `${endY}px`,
            '--r0': `${((i * 67) % 90) - 45}deg`,
            '--r1': `${((i * 113) % 540) - 270}deg`,
            animationDelay: `${(i % 5) * 0.12 + Math.floor(i / 5) * 0.08}s`,
          } as React.CSSProperties,
        };
      })
    : [];

  const piled = Array.from({ length: Math.min(pile, PILE_MAX) }, (_, i) => ({
    left: width * (0.08 + ((i * 37) % 70) / 100),
    bottom: Math.floor(i / 6) * noteH * 0.35 + 4,
    rotate: ((i * 53) % 50) - 25,
  }));

  return (
    <div className={`celeb ${className}`} style={{ width, height }} aria-hidden="true">
      <div className="celeb-pile">
        {piled.map((p, i) => (
          <span key={i} className="celeb-note" style={{ width: noteW, height: noteH, fontSize: noteH * 0.55, left: p.left, bottom: p.bottom, transform: `rotate(${p.rotate}deg)` }}>
            ₦
          </span>
        ))}
      </div>
      <div className="celeb-body">
        <div key={sprayKey} className={`celeb-react${sprayKey ? ' joy' : ''}`}>
          <div className="celeb-flash" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="celeb-img" draggable={false} />
        </div>
      </div>
      <div key={`n${sprayKey}`} className="celeb-falling">
        {falling.map((n, i) => (
          <span key={i} className={`celeb-note ${n.grab ? 'grab' : 'drop'}`} style={n.style}>₦</span>
        ))}
      </div>
    </div>
  );
}
