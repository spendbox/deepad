export default function Loading() {
  return (
    <div className="wz" role="status" aria-label="Loading">
      <aside className="wz-side" />
      <main className="wz-main">
        <div className="wz-content skeleton-page">
          <div className="sk sk-title" />
          <div className="sk sk-block tall" />
        </div>
      </main>
    </div>
  );
}
