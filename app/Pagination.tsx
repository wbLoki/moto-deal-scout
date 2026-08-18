'use client';

import { useRef } from 'react';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';

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
  locale,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  locale: Locale;
}) {
  const t = useT(locale);
  const navRef = useRef<HTMLElement>(null);
  if (pageCount <= 1) return null;

  const go = (next: number) => {
    onPage(next);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
    const target = navRef.current?.closest('.browse-main');
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior, block: 'start' });
      return;
    }
    window.scrollTo({ top: 0, behavior });
  };

  return (
    <nav ref={navRef} className="pagination" aria-label={t.common.pagination}>
      <button
        type="button"
        className="page-btn"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
      >
        {t.common.prev}
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
            onClick={() => go(p)}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className="page-btn"
        disabled={page >= pageCount}
        onClick={() => go(page + 1)}
      >
        {t.common.next}
      </button>
    </nav>
  );
}
