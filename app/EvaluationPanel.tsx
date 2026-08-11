'use client';

import type { BikeEvaluation, BikeInput } from '../src/compareModel.js';

const mad = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });
const fmtMAD = (n: number): string => `${mad.format(n)} MAD`;

/** Year · cc · mileage · price · city — only fields that are present. */
export function bikeDetailBits(
  bike: BikeInput,
  askingPrice?: number,
): string[] {
  const price = askingPrice ?? bike.priceMAD;
  return [
    bike.year != null ? String(bike.year) : null,
    bike.displacementCc != null ? `${bike.displacementCc} cc` : null,
    bike.mileageKm != null ? `${mad.format(bike.mileageKm)} km` : null,
    price != null ? fmtMAD(price) : null,
    bike.city?.trim() || null,
  ].filter(Boolean) as string[];
}

/**
 * Shared evaluation result: brand/model, one rating tag, bike details, fair price.
 */
export function EvaluationPanel({
  evaluation,
  bike,
  children,
}: {
  evaluation: BikeEvaluation;
  /** The bike being rated — form values or fields read from a pasted ad. */
  bike?: BikeInput;
  /** Optional content above the result (e.g. AI banner). */
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
        {bike && <BikeDetails bike={bike} />}
      </div>
    );
  }

  const isAi = evaluation.status === 'ai-estimated';
  const brand = evaluation.matched?.brand ?? bike?.brand;
  const model = evaluation.matched?.model ?? bike?.model;
  const askingPrice = evaluation.rating?.askingPriceMAD ?? bike?.priceMAD;

  return (
    <div className="compare-result panel">
      {children}
      <h2 className="compare-heading">Evaluation</h2>

      <div className="compare-summary">
        {(brand || model) && (
          <p className="compare-bike-name">
            {brand} {model}
          </p>
        )}
        {evaluation.rating ? (
          <span
            className={`tag tag-${evaluation.rating.tierLevel}`}
            title={`Score ${evaluation.rating.score}/100`}
          >
            {evaluation.rating.tierLabel}
          </span>
        ) : (
          <p className="subtitle">Enter an asking price to get a deal rating.</p>
        )}
      </div>

      {bike && (
        <BikeDetails
          bike={bike}
          {...(askingPrice != null ? { askingPrice } : {})}
        />
      )}

      {evaluation.suggestion && (
        <p className="compare-range">
          Fair price{isAi ? ' (AI estimate)' : ''}:{' '}
          <strong>
            {fmtMAD(evaluation.suggestion.fairMin)} – {fmtMAD(evaluation.suggestion.fairMax)}
          </strong>
        </p>
      )}
    </div>
  );
}

function BikeDetails({
  bike,
  askingPrice,
}: {
  bike: BikeInput;
  askingPrice?: number;
}) {
  const bits = bikeDetailBits(bike, askingPrice);
  if (bits.length === 0) return null;
  return (
    <div className="compare-details meta">
      {bits.map((bit) => (
        <span key={bit}>{bit}</span>
      ))}
    </div>
  );
}
