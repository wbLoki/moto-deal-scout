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
}: {
  catalog: readonly CatalogBrand[];
  signedIn: boolean;
}) {
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
  const [error, setError] = useState<string | null>(null);
  const [signInFeature, setSignInFeature] = useState<string | null>(null);
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
    } = { brand, model };
    if (year) input.year = Number(year);
    if (mileage.trim()) input.mileageKm = Number(mileage);
    if (displacement.trim()) input.displacementCc = Number(displacement);
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
        setError(res.error ?? 'Something went wrong.');
      }
    });
  };

  const estimateWithAi = () => {
    if (!signedIn) {
      setSignInFeature('get AI price estimates');
      return;
    }
    setError(null);
    startTransition(async () => {
      const input = buildInput();
      const res = await estimateWithAiAction(input);
      if (res.ok && res.evaluation) setResult({ evaluation: res.evaluation, bike: input });
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
        setResult({
          evaluation: res.evaluation,
          bike: res.extracted ?? buildInput(),
          fromPaste: true,
        });
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
    setDisplacement(x.displacementCc != null ? String(x.displacementCc) : '');
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
            <span>Displacement (cc)</span>
            <input
              type="number"
              min={25}
              max={3500}
              step={1}
              value={displacement}
              placeholder="Optional"
              onChange={(e) => setDisplacement(e.target.value)}
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
        <summary>Or paste a listing link / ad text{signedIn ? '' : ' (sign in)'}</summary>
        <p className="settings-hint">
          Paste an Avito or Biker listing link to scan it live, or the ad text and let AI read it.
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
          {isPending ? 'Scanning…' : 'Parse & evaluate'}
        </button>
      </details>

      {error && <p className="settings-error">{error}</p>}

      {result && (
        <CompareResult
          evaluation={result.evaluation}
          bike={result.bike}
          {...(result.fromPaste ? { fromPaste: true } : {})}
          brand={result.bike.brand}
          model={result.bike.model}
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
  bike,
  fromPaste,
  brand,
  model,
  onEstimateAi,
  aiPending,
}: {
  evaluation: BikeEvaluation;
  bike: BikeInput;
  fromPaste?: boolean;
  brand: string;
  model: string;
  onEstimateAi: () => void;
  aiPending: boolean;
}) {
  if (evaluation.status === 'not-found') {
    return (
      <div className="compare-result panel">
        <h2 className="compare-heading">Evaluation</h2>
        <p className="compare-bike-name">
          {brand} {model}
        </p>
        <BikeMeta bike={bike} />
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
        <h2 className="compare-heading">Evaluation</h2>
        <p className="compare-bike-name">
          {evaluation.matched?.brand} {evaluation.matched?.model}
        </p>
        <span className="tag tag-calibrating">Calibrating</span>
        <BikeMeta bike={bike} />
        <p className="subtitle">
          We don&apos;t have enough recent listings for a fair price yet — get an AI estimate in the
          meantime.
        </p>
        <AiEstimateCta onEstimateAi={onEstimateAi} aiPending={aiPending} />
      </div>
    );
  }

  return (
    <EvaluationPanel evaluation={evaluation} bike={bike}>
      {fromPaste && <p className="compare-extracted">Read from the ad</p>}
      {evaluation.status === 'ai-estimated' && evaluation.ai && (
        <AiBanner confidence={evaluation.ai.confidence} rationale={evaluation.ai.rationale} />
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
