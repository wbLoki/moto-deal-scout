'use client';

import { useState, useTransition } from 'react';
import { reviewPricesAction } from './admin-ai-actions.js';
import type { RangeReviewPage, RangeReviewRow } from '../src/aiAdminService.js';

const mad = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });
const fmt = (n: number): string => mad.format(n);

/**
 * Admin tool: asks Claude whether our calibrated fair ranges look plausible,
 * one bounded batch at a time (to fit the serverless timeout and cap cost).
 * Flags anything not "plausible".
 */
export function PriceReview() {
  const [page, setPage] = useState<RangeReviewPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (offset: number): void => {
    setError(null);
    start(async () => {
      const res = await reviewPricesAction(offset);
      if (res.ok && res.page) setPage(res.page);
      else setError(res.error ?? 'Review failed.');
    });
  };

  return (
    <div className="price-review">
      <div className="scan-now">
        <button className="btn" type="button" disabled={pending} onClick={() => run(0)}>
          {pending && !page ? 'Reviewing…' : 'Review ranges with AI'}
        </button>
        {page && (
          <span className="status-pill">
            Reviewed {page.reviewed}/{page.total}
          </span>
        )}
      </div>

      {error && <p className="settings-error">{error}</p>}

      {page && (
        <>
          <table className="review-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Our range (MAD)</th>
                <th>Verdict</th>
                <th>AI suggestion</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <ReviewRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>

          {page.nextOffset !== null && (
            <button
              className="btn btn-small"
              type="button"
              disabled={pending}
              onClick={() => run(page.nextOffset!)}
            >
              {pending ? 'Reviewing…' : 'Review next batch'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ReviewRow({ row }: { row: RangeReviewRow }) {
  const off = row.review.verdict !== 'plausible' && row.review.verdict !== 'unsure';
  const suggestion =
    row.review.suggestedMinMAD != null && row.review.suggestedMaxMAD != null
      ? `${fmt(row.review.suggestedMinMAD)} – ${fmt(row.review.suggestedMaxMAD)}`
      : '—';
  return (
    <tr className={off ? 'review-flagged' : undefined}>
      <td>
        {row.brand} {row.model}
      </td>
      <td>
        {fmt(row.min)} – {fmt(row.max)}
      </td>
      <td>
        <span className={`review-verdict v-${row.review.verdict}`}>{row.review.verdict}</span>
      </td>
      <td>{suggestion}</td>
      <td className="review-note">{row.review.note}</td>
    </tr>
  );
}
