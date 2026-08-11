'use client';

import type { BikeEvaluation } from '../src/compareModel.js';

const mad = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });
const fmtMAD = (n: number): string => `${mad.format(n)} MAD`;

const POSITION_NOTE: Record<'below' | 'within' | 'above', string> = {
  below: 'Below the fair range — a good sign for a buyer.',
  within: 'Within the fair market range.',
  above: 'Above the fair range — likely overpriced.',
};

/**
 * Shared evaluation result panel for the compare page: heading, match, score
 * breakdown, and fair price.
 */
export function EvaluationPanel({
  evaluation,
  showTargets = false,
  children,
}: {
  evaluation: BikeEvaluation;
  /** When true, also list deal-tier price ceilings under fair price (public compare). */
  showTargets?: boolean;
  /** Optional content above the rating (e.g. AI banner, extracted-ad note). */
  children?: React.ReactNode;
}) {
  if (evaluation.status === 'not-found') {
    return (
      <div className="compare-result panel">
        {children}
        <h2 className="compare-heading">Evaluation</h2>
        <p className="subtitle">Model not found in tracked criteria.</p>
      </div>
    );
  }

  if (evaluation.status === 'calibrating') {
    return (
      <div className="compare-result panel">
        {children}
        <h2 className="compare-heading">Evaluation</h2>
        <span className="tag tag-calibrating">Calibrating</span>
        <p className="subtitle">
          Matched {evaluation.matched?.brand} {evaluation.matched?.model}, but no fair price range
          yet.
        </p>
      </div>
    );
  }

  const isAi = evaluation.status === 'ai-estimated';

  return (
    <div className="compare-result panel">
      {children}
      <h2 className="compare-heading">Evaluation</h2>
      {evaluation.matched && (
        <p className="compare-matched">
          {isAi ? 'AI estimate for' : 'Matched to'}{' '}
          <strong>
            {evaluation.matched.brand} {evaluation.matched.model}
          </strong>
        </p>
      )}
      {evaluation.rating && (
        <div className="compare-rating">
          <div className="compare-verdict">
            <span className={`tag tag-${evaluation.rating.tierLevel}`}>
              {evaluation.rating.tierLabel}
            </span>
            <span className="compare-score">{evaluation.rating.score}/100</span>
          </div>
          <p className={`compare-position pos-${evaluation.rating.pricePosition}`}>
            {POSITION_NOTE[evaluation.rating.pricePosition]}
          </p>
          <div className="factors">
            {evaluation.rating.factors.map((f) => (
              <div key={f.label} className="factor">
                <div className="factor-head">
                  <span>{f.label}</span>
                  <span className="factor-pts">
                    {f.points}/{f.max}
                  </span>
                </div>
                <div className="factor-track">
                  <div
                    className="factor-fill"
                    style={{ width: `${f.max > 0 ? (f.points / f.max) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {evaluation.rating.reasons.length > 0 && (
            <ul className="factor-reasons">
              {evaluation.rating.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {evaluation.suggestion && (
        <div className="compare-suggestion">
          <h3 className="compare-heading">Fair price{isAi ? ' (AI estimate)' : ''}</h3>
          <p className="compare-range">
            This model normally sells for{' '}
            <strong>
              {fmtMAD(evaluation.suggestion.fairMin)} – {fmtMAD(evaluation.suggestion.fairMax)}
            </strong>
            .
          </p>
          {showTargets && (
            <ul className="compare-targets">
              {evaluation.suggestion.targets.map((t) => (
                <li key={t.level}>
                  {t.reachable && t.maxPrice !== null ? (
                    <>
                      <span className={`tag tag-${t.level}`}>{t.label}</span> at or below{' '}
                      <strong>{fmtMAD(t.maxPrice)}</strong>
                    </>
                  ) : (
                    <>
                      <span className={`tag tag-${t.level}`}>{t.label}</span>{' '}
                      <span className="muted">out of reach — mileage/age hold this bike back</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
