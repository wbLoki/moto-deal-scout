/** Instant soft-nav feedback while the destination RSC stream loads. */
export default function Loading() {
  return (
    <main className="container">
      <header className="site-header" aria-hidden />
      <div className="title" style={{ opacity: 0.35 }}>
        &nbsp;
      </div>
      <p className="subtitle" style={{ opacity: 0.35 }}>
        Loading…
      </p>
    </main>
  );
}
