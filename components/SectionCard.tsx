const ICONS: Record<string, React.ReactNode> = {
  photo: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-5-5-8 8" /></>,
  details: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 15 15 15h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7.5" r="1" /><circle cx="14.5" cy="7.5" r="1" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  lines: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  money: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" /></>,
  report: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
};

/** A settings card with an icon, a title and a one-line explanation. */
export default function SectionCard({
  icon,
  title,
  hint,
  tone,
  action,
  children,
  id,
}: {
  icon: keyof typeof ICONS | string;
  title: string;
  hint?: React.ReactNode;
  tone?: 'danger';
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className={`sec-card${tone ? ` ${tone}` : ''}`} aria-labelledby={id ? `${id}-h` : undefined}>
      <header className="sec-head">
        <span className="sec-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[icon]}
          </svg>
        </span>
        <div className="sec-title">
          <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
          {hint && <p className="hint">{hint}</p>}
        </div>
        {action && <div className="sec-action">{action}</div>}
      </header>
      <div className="sec-body">{children}</div>
    </section>
  );
}
