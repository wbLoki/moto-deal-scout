'use client';

/** Windowed page list, e.g. [1, '…', 4, 5, 6, '…', 20]. */
function windowed(current: number, total: number): (number | '…')[] {
  const range: number[] = [];
  for (let i = Math.max(1, current - 1); i <= Math.min(total, current + 1); i++) range.push(i);
  const ends: number[] = [];
  if (!range.includes(1)) ends.push(1);
  ends.push(...range);
  if (!range.includes(total)) ends.push(total);

  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of ends) {
    if (prev && p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

/** Numbered pager (no infinite scroll). Renders nothing for a single page. */
export function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="page-btn"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Prev
      </button>
      {windowed(page, pageCount).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="page-ellipsis">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={p === page ? 'page-btn active' : 'page-btn'}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className="page-btn"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
