'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  estimateWithAiAction,
  evaluateBikeAction,
  evaluatePastedListingAction,
} from './compare-actions.js';
import { EvaluationPanel, bikeDetailBits } from './EvaluationPanel.js';
import { SignInModal } from './SignInModal.js';
import type { BikeEvaluation, BikeInput } from '../src/compareModel.js';
import { useT } from './i18n/I18nProvider.js';
import type { ErrorKey, SignInFeature } from './i18n/en.js';
import type { Locale } from './i18n/locales.js';
import type { VehicleType } from '../src/domain/entities/VehicleType.js';

interface CatalogBrand {
  readonly brand: string;
  readonly models: readonly string[];
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR + 1 - 1990 + 1 }, (_, i) => CURRENT_YEAR + 1 - i);

/** What the result panel shows: our evaluation, plus the bike we rated. */
interface ResultState {
  readonly evaluation: BikeEvaluation;
  readonly bike: BikeInput;
  /** True when fields came from a pasted ad (shows a short note). */
  readonly fromPaste?: boolean;
}

/**
 * Public "Compare your bike" form. The deterministic rating is open to everyone;
 * the two AI actions (estimate an un-tracked bike, read a pasted ad) are
 * signed-in only because they cost per call — anonymous clicks open the sign-in
 * modal.
 */
export function CompareForm({
  catalog,
  signedIn,
  locale,
  vehicleType = 'motorcycle',
}: {
  catalog: readonly CatalogBrand[];
  signedIn: boolean;
  locale: Locale;
  vehicleType?: VehicleType;
}) {
  const t = useT(locale);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [mileage, setMileage] = useState('');
  const [displacement, setDisplacement] = useState('');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [signInFeature, setSignInFeature] = useState<SignInFeature | null>(null);
  const [isPending, startTransition] = useTransition();

  const models = useMemo(
    () => catalog.find((b) => b.brand === brand)?.models ?? [],
    [catalog, brand],
  );
  const canSubmit = brand.trim() !== '' && model.trim() !== '';

  const buildInput = (): BikeInput => {
    // Omit empty optionals so the server-action payload never sends `null` for
    // blank fields (zod coerce would turn those into 0 and fail validation).
    const input: {
      brand: string;
      model: string;
      year?: number;
      mileageKm?: number;
      displacementCc?: number;
      priceMAD?: number;
      city?: string;
      vehicleType: VehicleType;
    } = { brand, model, vehicleType };
    if (year) input.year = Number(year);
    if (mileage.trim()) input.mileageKm = Number(mileage);
    if (vehicleType !== 'car' && displacement.trim()) input.displacementCc = Number(displacement);
    if (price.trim()) input.priceMAD = Number(price);
    if (city.trim()) input.city = city.trim();
    return input;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!canSubmit) return;
    startTransition(async () => {
      const input = buildInput();
      const res = await evaluateBikeAction(input);
      if (res.ok && res.evaluation) setResult({ evaluation: res.evaluation, bike: input });
      else {
        setResult(null);
        setError(res.error ?? 'evaluate_failed');
      }
    });
  };

  const estimateWithAi = () => {
    if (!signedIn) {
      setSignInFeature('aiEstimate');
      return;
    }
    setError(null);
    startTransition(async () => {
      const input = buildInput();
      const res = await estimateWithAiAction(input);
      if (res.ok && res.evaluation) setResult({ evaluation: res.evaluation, bike: input });
      else if (res.reason === 'auth') setSignInFeature('aiEstimate');
      else setError(res.error ?? 'ai_estimate_failed');
    });
  };

  const evaluatePasted = () => {
    if (!signedIn) {
      setSignInFeature('aiReader');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await evaluatePastedListingAction(pasteText, vehicleType);
      if (res.ok && res.evaluation) {
        // Fill the form with what Claude read, so the user can correct + re-run.
        if (res.extracted) applyExtracted(res.extracted);
        setResult({
          evaluation: res.evaluation,
          bike: res.extracted ?? buildInput(),
          fromPaste: true,
        });
      } else if (res.reason === 'auth') {
        setSignInFeature('aiReader');
      } else {
        setError(res.error ?? 'read_listing_failed');
      }
    });
  };

  const applyExtracted = (x: BikeInput) => {
    setBrand(x.brand);
    setModel(x.model);
    setYear(x.year != null ? String(x.year) : '');
    setMileage(x.mileageKm != null ? String(x.mileageKm) : '');
    setDisplacement(x.displacementCc != null ? String(x.displacementCc) : '');
    setPrice(x.priceMAD != null ? String(x.priceMAD) : '');
    setCity(x.city ?? '');
  };

  return (
    <div className="compare">
      <form className="compare-form panel" onSubmit={submit}>
        <div className="compare-grid">
          <label className="field">
            <span>{t.compare.brand}</span>
            <select
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setModel('');
              }}
            >
              <option value="">{t.compare.selectBrand}</option>
              {catalog.map((b) => (
                <option key={b.brand} value={b.brand}>
                  {b.brand}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{t.compare.model}</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={!brand}>
              <option value="">{brand ? t.compare.selectModel : t.compare.pickBrandFirst}</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{t.compare.year}</span>
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">{t.common.any}</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{t.compare.mileage}</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={mileage}
              placeholder={t.common.optional}
              onChange={(e) => setMileage(e.target.value)}
            />
          </label>

          {vehicleType !== 'car' && (
          <label className="field">
            <span>{t.compare.displacement}</span>
            <input
              type="number"
              min={25}
              max={3500}
              step={1}
              value={displacement}
              placeholder={t.common.optional}
              onChange={(e) => setDisplacement(e.target.value)}
            />
          </label>
          )}

          <label className="field">
            <span>{t.compare.price}</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={price}
              placeholder={t.compare.pricePlaceholder}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>

          <label className="field">
            <span>{t.compare.city}</span>
            <input
              type="text"
              value={city}
              placeholder={t.compare.cityPlaceholder}
              onChange={(e) => setCity(e.target.value)}
            />
          </label>
        </div>

        {touched && !canSubmit && <p className="settings-error">{t.compare.pickBrandModel}</p>}

        <button className="btn btn-primary" type="submit" disabled={isPending}>
          {isPending ? t.compare.evaluating : t.compare.evaluate}
        </button>
      </form>

      <details className="compare-paste panel">
        <summary>{signedIn ? t.compare.pasteSummary : t.compare.pasteSummaryGuest}</summary>
        <p className="settings-hint">{t.compare.pasteHint}</p>
        <textarea
          className="compare-textarea"
          rows={5}
          value={pasteText}
          placeholder={t.compare.pastePlaceholder}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <button
          className="btn"
          type="button"
          disabled={isPending || pasteText.trim().length < 10}
          onClick={evaluatePasted}
        >
          {isPending ? t.compare.scanning : t.compare.parseEvaluate}
        </button>
      </details>

      {error && <p className="settings-error">{t.errors[error]}</p>}

      {result && (
        <CompareResult
          locale={locale}
          evaluation={result.evaluation}
          bike={result.bike}
          {...(result.fromPaste ? { fromPaste: true } : {})}
          brand={result.bike.brand}
          model={result.bike.model}
          onEstimateAi={estimateWithAi}
          aiPending={isPending}
        />
      )}

      <SignInModal
        locale={locale}
        feature={signInFeature}
        onClose={() => setSignInFeature(null)}
      />
    </div>
  );
}

function CompareResult({
  evaluation,
  bike,
  fromPaste,
  brand,
  model,
  onEstimateAi,
  aiPending,
  locale,
}: {
  evaluation: BikeEvaluation;
  bike: BikeInput;
  fromPaste?: boolean;
  brand: string;
  model: string;
  onEstimateAi: () => void;
  aiPending: boolean;
  locale: Locale;
}) {
  const t = useT(locale);
  if (evaluation.status === 'not-found') {
    return (
      <div className="compare-result panel">
        <h2 className="compare-heading">{t.compare.evaluation}</h2>
        <p className="compare-bike-name">
          {brand} {model}
        </p>
        <BikeMeta bike={bike} />
        <p className="subtitle">
          {t.compare.notMatchedLead(brand, model)}
          <Link href="/requests" className="card-link">
            {t.compare.notMatchedLink}
          </Link>
          {t.compare.notMatchedTail}
        </p>
        <AiEstimateCta locale={locale} onEstimateAi={onEstimateAi} aiPending={aiPending} />
      </div>
    );
  }

  if (evaluation.status === 'calibrating') {
    return (
      <div className="compare-result panel">
        <h2 className="compare-heading">{t.compare.evaluation}</h2>
        <p className="compare-bike-name">
          {evaluation.matched?.brand} {evaluation.matched?.model}
        </p>
        <span className="tag tag-calibrating">{t.tiers.calibrating}</span>
        <BikeMeta bike={bike} />
        <p className="subtitle">{t.compare.calibratingHint}</p>
        <AiEstimateCta locale={locale} onEstimateAi={onEstimateAi} aiPending={aiPending} />
      </div>
    );
  }

  return (
    <EvaluationPanel locale={locale} evaluation={evaluation} bike={bike}>
      {fromPaste && <p className="compare-extracted">{t.compare.readFromAd}</p>}
      {evaluation.status === 'ai-estimated' && evaluation.ai && (
        <AiBanner
          locale={locale}
          confidence={evaluation.ai.confidence}
          rationale={evaluation.ai.rationale}
        />
      )}
    </EvaluationPanel>
  );
}

function BikeMeta({ bike }: { bike: BikeInput }) {
  const bits = bikeDetailBits(bike);
  if (bits.length === 0) return null;
  return (
    <div className="compare-details meta">
      {bits.map((bit) => (
        <span key={bit}>{bit}</span>
      ))}
    </div>
  );
}

function AiBanner({
  confidence,
  rationale,
  locale,
}: {
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
  locale: Locale;
}) {
  const t = useT(locale);
  return (
    <div className="ai-banner">
      <div className="ai-banner-head">
        <span className="ai-badge">{t.compare.aiEstimate}</span>
        <span className="ai-confidence">{t.compare.confidence(confidence)}</span>
      </div>
      <p className="ai-rationale">{rationale}</p>
      <p className="ai-disclaimer">{t.compare.disclaimer}</p>
    </div>
  );
}

function AiEstimateCta({
  onEstimateAi,
  aiPending,
  locale,
}: {
  onEstimateAi: () => void;
  aiPending: boolean;
  locale: Locale;
}) {
  const t = useT(locale);
  return (
    <button className="btn" type="button" onClick={onEstimateAi} disabled={aiPending}>
      {aiPending ? t.compare.estimating : t.compare.estimateAi}
    </button>
  );
}
