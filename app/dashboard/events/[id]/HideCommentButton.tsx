'use client';

import { useState, useTransition } from 'react';
import { setTransferHidden } from '../../../actions';

/** Take one transfer's comment off the big screen (or put it back). The spray itself still shows. */
export default function HideCommentButton({ eventId, transferId, hidden }: { eventId: string; transferId: number; hidden: boolean }) {
  const [isHidden, setIsHidden] = useState(hidden);
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="link-btn"
      style={{ minHeight: 0, fontSize: 'inherit' }}
      disabled={busy}
      onClick={() =>
        start(async () => {
          try {
            await setTransferHidden(eventId, transferId, !isHidden);
            setIsHidden(!isHidden);
          } catch {}
        })
      }
    >
      {busy ? 'Saving…' : isHidden ? 'Show on screen' : 'Hide from screen'}
    </button>
  );
}
