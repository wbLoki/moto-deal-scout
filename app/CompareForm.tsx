'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  estimateWithAiAction,
  evaluateBikeAction,
  evaluatePastedListingAction,
} from './compare-actions.js';
import { SignInModal } from './SignInModal.js';
import type { BikeEvaluation, BikeInput } from '../src/compareModel.js';

interface CatalogBrand {
  readonly brand: string;
  readonly models: readonly string[];
}

const mad = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });
const fmtMAD = (n: number): string => `${mad.format(n)} MAD`;

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR + 1 - 1990 + 1 }, (_, i) => CURRENT_YEAR + 1 - i);

const POSITION_NOTE: Record<'below' | 'within' | 'above', string> = {
  below: 'Below the fair range — a good sign for a buyer.',
  within: 'Within the fair market range.',
  above: 'Above the fair range — likely overpriced.',
};

/** What the result panel shows: our evaluation, plus AI-extracted fields when pasted. */
interface ResultState {
  readonly evaluation: BikeEvaluation;
  readonly extracted?: BikeInput;
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
}: {
  catalog: readonly CatalogBrand[];
  signedIn: boolean;
}) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [mileage, setMileage] = useState('');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signInFeature, setSignInFeature] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const models = useMemo(
    () => catalog.find((b) => b.brand === brand)?.models ?? [],
    [catalog, brand],
  );
  const canSubmit = brand.trim() !== '' && model.trim() !== '';

  const buildInput = () => ({
    brand,
    model,
    year: year ? Number(year) : undefined,
    mileageKm: mileage.trim() ? Number(mileage) : undefined,
    priceMAD: price.trim() ? Number(price) : undefined,
    city: city.trim() || undefined,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await evaluateBikeAction(buildInput());
      if (res.ok && res.evaluation) setResult({ evaluation: res.evaluation });
      else setError(res.error ?? 'Something went wrong.');
    });
  };

  const estimateWithAi = () => {
    if (!signedIn) {
      setSignInFeature('get AI price estimates');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await estimateWithAiAction(buildInput());
      if (res.ok && res.evaluation) setResult({ evaluation: res.evaluation });
      else if (res.reason === 'auth') setSignInFeature('get AI price estimates');
      else setError(res.error ?? 'The AI estimate failed.');
    });
  };

  const evaluatePasted = () => {
    if (!signedIn) {
      setSignInFeature('use the AI listing reader');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await evaluatePastedListingAction(pasteText);
      if (res.ok && res.evaluation) {
        // Fill the form with what Claude read, so the user can correct + re-run.
        if (res.extracted) applyExtracted(res.extracted);
        setResult({ evaluation: res.evaluation, ...(res.extracted ? { extracted: res.extracted } : {}) });
      } else if (res.reason === 'auth') {
        setSignInFeature('use the AI listing reader');
      } else {
        setError(res.error ?? 'Couldn’t read that listing.');
      }
    });
  };

  const applyExtracted = (x: BikeInput) => {
    setBrand(x.brand);
    setModel(x.model);
    setYear(x.year != null ? String(x.year) : '');
    setMileage(x.mileageKm != null ? String(x.mileageKm) : '');
    setPrice(x.priceMAD != null ? String(x.priceMAD) : '');
    setCity(x.city ?? '');
  };

  return (
    <div className="compare">
      <form className="compare-form panel" onSubmit={submit}>
        <div className="compare-grid">
          <label className="field">
            <span>Brand</span>
            <select
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setModel('');
              }}
            >
              <option value="">Select a brand…</option>
              {catalog.map((b) => (
                <option key={b.brand} value={b.brand}>
                  {b.brand}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={!brand}>
              <option value="">{brand ? 'Select a model…' : 'Pick a brand first'}</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Year</span>
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Any</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Mileage (km)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={mileage}
              placeholder="Optional"
              onChange={(e) => setMileage(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Asking price (MAD)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={price}
              placeholder="Optional — for a rating"
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>

          <label className="field">
            <span>City</span>
            <input
              type="text"
              value={city}
              placeholder="Optional — e.g. Casablanca"
              onChange={(e) => setCity(e.target.value)}
            />
          </label>
        </div>

        {touched && !canSubmit && (
          <p className="settings-error">Pick a brand and model to evaluate.</p>
        )}

        <button className="btn btn-primary" type="submit" disabled={isPending}>
          {isPending ? 'Evaluating…' : 'Evaluate'}
        </button>
      </form>

      <details className="compare-paste panel">
        <summary>Or paste an ad and let AI read it{signedIn ? '' : ' (sign in)'}</summary>
        <p className="settings-hint">
          Paste the listing text (title + description). Claude extracts the brand, model, year,
          mileage and price, then we rate it with our engine.
        </p>
        <textarea
          className="compare-textarea"
          rows={5}
          value={pasteText}
          placeholder="Paste the ad text here…"
          onChange={(e) => setPasteText(e.target.value)}
        />
        <button
          className="btn"
          type="button"
          disabled={isPending || pasteText.trim().length < 10}
          onClick={evaluatePasted}
        >
          {isPending ? 'Reading…' : 'Parse & evaluate'}
        </button>
      </details>

      {error && <p className="settings-error">{error}</p>}

      {result && (
        <CompareResult
          evaluation={result.evaluation}
          extracted={result.extracted}
          brand={brand}
          model={model}
          onEstimateAi={estimateWithAi}
          aiPending={isPending}
        />
      )}

      <SignInModal feature={signInFeature} onClose={() => setSignInFeature(null)} />
    </div>
  );
}

function CompareResult({
  evaluation,
  extracted,
  brand,
  model,
  onEstimateAi,
  aiPending,
}: {
  evaluation: BikeEvaluation;
  extracted?: BikeInput | undefined;
  brand: string;
  model: string;
  onEstimateAi: () => void;
  aiPending: boolean;
}) {
  if (evaluation.status === 'not-found') {
    return (
      <div className="compare-result panel">
        {extracted && <ExtractedNote extracted={extracted} />}
        <h2 className="compare-heading">We don&apos;t track this model yet</h2>
        <p className="subtitle">
          We couldn&apos;t match “{brand} {model}” to a model we price. You can{' '}
          <Link href="/requests" className="card-link">
            request it
          </Link>{' '}
          — or get an AI estimate now.
        </p>
        <AiEstimateCta onEstimateAi={onEstimateAi} aiPending={aiPending} />
      </div>
    );
  }

  if (evaluation.status === 'calibrating') {
    return (
      <div className="compare-result panel">
        {extracted && <ExtractedNote extracted={extracted} />}
        <span className="tag tag-calibrating">Calibrating</span>
        <h2 className="compare-heading">
          {evaluation.matched?.brand} {evaluation.matched?.model}
        </h2>
        <p className="subtitle">
          We matched this model but don&apos;t have enough recent listings to know its fair price
          yet — get an AI estimate in the meantime.
        </p>
        <AiEstimateCta onEstimateAi={onEstimateAi} aiPending={aiPending} />
      </div>
    );
  }

  const isAi = evaluation.status === 'ai-estimated';
  return (
    <div className="compare-result panel">
      {extracted && <ExtractedNote extracted={extracted} />}
      {evaluation.matched && (
        <p className="compare-matched">
          {isAi ? 'AI estimate for' : 'Matched to'}{' '}
          <strong>
            {evaluation.matched.brand} {evaluation.matched.model}
          </strong>
        </p>
      )}
      {isAi && evaluation.ai && <AiBanner confidence={evaluation.ai.confidence} rationale={evaluation.ai.rationale} />}
      {evaluation.rating && <RatingBlock rating={evaluation.rating} />}
      {evaluation.suggestion && <SuggestionBlock suggestion={evaluation.suggestion} ai={isAi} />}
    </div>
  );
}

function ExtractedNote({ extracted }: { extracted: BikeInput }) {
  const bits = [
    `${extracted.brand} ${extracted.model}`,
    extracted.year != null ? `${extracted.year}` : null,
    extracted.mileageKm != null ? `${mad.format(extracted.mileageKm)} km` : null,
    extracted.priceMAD != null ? fmtMAD(extracted.priceMAD) : null,
    extracted.city ?? null,
  ].filter(Boolean);
  return <p className="compare-extracted">Read from the ad: {bits.join(' · ')}</p>;
}

function AiBanner({
  confidence,
  rationale,
}: {
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
}) {
  return (
    <div className="ai-banner">
      <div className="ai-banner-head">
        <span className="ai-badge">AI estimate</span>
        <span className="ai-confidence">confidence: {confidence}</span>
      </div>
      <p className="ai-rationale">{rationale}</p>
      <p className="ai-disclaimer">Not from our market data — an AI estimate. Verify before acting.</p>
    </div>
  );
}

function AiEstimateCta({ onEstimateAi, aiPending }: { onEstimateAi: () => void; aiPending: boolean }) {
  return (
    <button className="btn" type="button" onClick={onEstimateAi} disabled={aiPending}>
      {aiPending ? 'Estimating…' : 'Estimate with AI (beta)'}
    </button>
  );
}

function RatingBlock({ rating }: { rating: NonNullable<BikeEvaluation['rating']> }) {
  return (
    <div className="compare-rating">
      <div className="compare-verdict">
        <span className={`tag tag-${rating.tierLevel}`}>{rating.tierLabel}</span>
        <span className="compare-score">{rating.score}/100</span>
      </div>
      <p className={`compare-position pos-${rating.pricePosition}`}>
        {POSITION_NOTE[rating.pricePosition]}
      </p>

      <div className="factors">
        {rating.factors.map((f) => (
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

      {rating.reasons.length > 0 && (
        <ul className="factor-reasons">
          {rating.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionBlock({
  suggestion,
  ai,
}: {
  suggestion: NonNullable<BikeEvaluation['suggestion']>;
  ai: boolean;
}) {
  return (
    <div className="compare-suggestion">
      <h3 className="compare-heading">Fair price{ai ? ' (AI estimate)' : ''}</h3>
      <p className="compare-range">
        This model normally sells for{' '}
        <strong>
          {fmtMAD(suggestion.fairMin)} – {fmtMAD(suggestion.fairMax)}
        </strong>
        .
      </p>
      <ul className="compare-targets">
        {suggestion.targets.map((t) => (
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
    </div>
  );
}
