'use client';

import { useEffect, useState } from 'react';

export type Tab = { id: string; label: string; badge?: number; content: React.ReactNode };

/** Overview / Lines / Settings. Remembers the open tab in the address (#lines), so a refresh stays put. */
export default function EventTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0].id);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (tabs.some((t) => t.id === fromHash)) setActive(fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(id: string) {
    setActive(id);
    window.history.replaceState(null, '', `#${id}`);
  }

  return (
    <>
      <div className="ev-tabs" role="tablist" aria-label="Event sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => open(t.id)}
          >
            {t.label}
            {!!t.badge && <span className="ev-tab-badge" aria-label={`${t.badge} waiting`}>{t.badge}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="ev-panel">
          {t.content}
        </div>
      ))}
    </>
  );
}
