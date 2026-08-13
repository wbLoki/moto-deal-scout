'use client';

import type { BikeEvaluation, BikeInput } from '../src/compareModel.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';
import type { DealTierLevel } from '../src/domain/services/dealTier.js';

const mad = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });
const fmtMAD = (n: number): string => `${mad.format(n)} MAD`;

function isTierLevel(level: string): level is DealTierLevel {
  return (
    level === 'hot' ||
    level === 'great' ||
    level === 'good' ||
    level === 'okay' ||
    level === 'bad' ||
    level === 'calibrating'
  );
}

/** Year · cc · mileage · price · city — only fields that are present. */
export function bikeDetailBits(bike: BikeInput, askingPrice?: number): string[] {
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
  locale,
}: {
  evaluation: BikeEvaluation;
  bike?: BikeInput;
  children?: React.ReactNode;
  locale: Locale;
}) {
  const t = useT(locale);
  if (evaluation.status === 'not-found') {
    return (
      <div className="compare-result panel">
        {children}
        <h2 className="compare-heading">{t.compare.evaluation}</h2>
        <p className="subtitle">{t.compare.notFound}</p>
      </div>
    );
  }

  if (evaluation.status === 'calibrating') {
    return (
      <div className="compare-result panel">
        {children}
        <h2 className="compare-heading">{t.compare.evaluation}</h2>
        <span className="tag tag-calibrating">{t.tiers.calibrating}</span>
        <p className="subtitle">
          {t.compare.calibratingMatched(
            evaluation.matched?.brand ?? '',
            evaluation.matched?.model ?? '',
          )}
        </p>
        {bike && <BikeDetails bike={bike} />}
      </div>
    );
  }

  const isAi = evaluation.status === 'ai-estimated';
  const brand = evaluation.matched?.brand ?? bike?.brand;
  const model = evaluation.matched?.model ?? bike?.model;
  const askingPrice = evaluation.rating?.askingPriceMAD ?? bike?.priceMAD;
  const tierLevel = evaluation.rating?.tierLevel;
  const tierLabel =
    tierLevel && isTierLevel(tierLevel) ? t.tiers[tierLevel] : evaluation.rating?.tierLabel;

  return (
    <div className="compare-result panel">
      {children}
      <h2 className="compare-heading">{t.compare.evaluation}</h2>

      <div className="compare-summary">
        {(brand || model) && (
          <p className="compare-bike-name">
            {brand} {model}
          </p>
        )}
        {evaluation.rating ? (
          <span
            className={`tag tag-${evaluation.rating.tierLevel}`}
            title={t.card.score(evaluation.rating.score)}
          >
            {tierLabel}
          </span>
        ) : (
          <p className="subtitle">{t.compare.enterPrice}</p>
        )}
      </div>

      {bike && <BikeDetails bike={bike} {...(askingPrice != null ? { askingPrice } : {})} />}

      {evaluation.suggestion && (
        <p className="compare-range">
          {isAi ? t.compare.fairPriceAi : t.compare.fairPrice}{' '}
          <strong>
            {fmtMAD(evaluation.suggestion.fairMin)} – {fmtMAD(evaluation.suggestion.fairMax)}
          </strong>
        </p>
      )}
    </div>
  );
}

function BikeDetails({ bike, askingPrice }: { bike: BikeInput; askingPrice?: number }) {
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
