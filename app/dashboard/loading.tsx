import DashShell from './DashShell';

/** Shown instantly while a dashboard page loads, so taps feel immediate. */
export default function Loading() {
  return (
    <DashShell>
      <div className="skeleton-page" role="status" aria-label="Loading">
        <div className="sk sk-title" />
        <div className="sk sk-block" />
        <div className="sk-row">
          <div className="sk sk-tile" />
          <div className="sk sk-tile" />
          <div className="sk sk-tile" />
        </div>
        <div className="sk sk-block tall" />
      </div>
    </DashShell>
  );
}
