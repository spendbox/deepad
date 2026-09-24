'use client';

import { useRef } from 'react';

/** "View all" button that opens every spray in a pop-up list. */
export default function AllSpraysDialog({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-block" onClick={() => ref.current?.showModal()}>
        View all {count} sprays
      </button>
      <dialog
        ref={ref}
        className="sprays-dialog"
        aria-label="All sprays"
        onClick={(e) => {
          // Tap outside the box to close.
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="sprays-dialog-head">
          <h2>All sprays ({count})</h2>
          <button type="button" className="btn btn-sm" onClick={() => ref.current?.close()} aria-label="Close">
            Close
          </button>
        </div>
        <div className="sprays-dialog-body">{children}</div>
      </dialog>
    </>
  );
}
