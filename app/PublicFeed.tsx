'use client';

import { useMemo, useState } from 'react';
import { DealCardShell, type DealCardData } from './DealCardShell.js';
import { DealSearchBar, matchesQuery } from './DealSearchBar.js';
import { SignInModal } from './SignInModal.js';
import { BookmarkIcon, EyeIcon } from './icons.js';

const CURRENT_YEAR = new Date().getFullYear();

/**
 * The members-only controls as they appear for anonymous visitors: clicking
 * either prompts sign-in rather than navigating away.
 */
function PublicCardActions({ onNeedSignIn }: { onNeedSignIn: (feature: string) => void }) {
  return (
    <div className="card-actions">
      <button
        type="button"
        className="watch-eye"
        title="Follow this model"
        aria-label="Follow this model"
        onClick={() => onNeedSignIn('follow models')}
      >
        <EyeIcon size={18} />
      </button>
      <button
        type="button"
        className="watch-eye"
        title="Save this bike"
        aria-label="Save this bike"
        onClick={() => onNeedSignIn('save bikes')}
      >
        <BookmarkIcon size={16} />
      </button>
    </div>
  );
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/**
 * The public deal feed: the same filter panel + search bar + card grid the
 * dashboard uses, but filtered entirely client-side (nothing is saved). Signing
 * in is what unlocks a persisted range, following, saving and alerts.
 */
export function PublicFeed({ deals }: { deals: readonly DealCardData[] }) {
  const priceCap = useMemo(
    () => roundUp(Math.max(50000, ...deals.map((d) => d.priceMAD)), 5000),
    [deals],
  );

  const [signInFeature, setSignInFeature] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [budgetMin, setBudgetMin] = useState(0);
  const [budgetMax, setBudgetMax] = useState(priceCap);
  const [yearMin, setYearMin] = useState(2000);
  const [yearMax, setYearMax] = useState(CURRENT_YEAR + 1);

  const invalid = budgetMax < budgetMin || yearMax < yearMin;

  const filtered = useMemo(() => {
    if (invalid) return [];
    return deals.filter((d) => {
      if (d.priceMAD < budgetMin || d.priceMAD > budgetMax) return false;
      if (d.year !== null && (d.year < yearMin || d.year > yearMax)) return false;
      return matchesQuery(d, query);
    });
  }, [deals, budgetMin, budgetMax, yearMin, yearMax, query, invalid]);

  return (
    <>
      <section className="settings">
        <div className="settings-head">
          <h2 className="settings-title">Filter deals</h2>
          <span className="settings-hint">
            {filtered.length} of {deals.length} listings
          </span>
        </div>

        <DealSearchBar value={query} onChange={setQuery} />

        <div className="settings-grid">
          <fieldset className="field-group">
            <legend>Budget (MAD)</legend>
            <label>
              <span>Min</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={budgetMin}
                onChange={(e) => setBudgetMin(Number(e.target.value))}
              />
            </label>
            <label>
              <span>Max</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={budgetMax}
                onChange={(e) => setBudgetMax(Number(e.target.value))}
              />
            </label>
          </fieldset>

          <fieldset className="field-group">
            <legend>Model year</legend>
            <label>
              <span>From</span>
              <input
                type="number"
                min={1980}
                max={CURRENT_YEAR + 1}
                value={yearMin}
                onChange={(e) => setYearMin(Number(e.target.value))}
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="number"
                min={1980}
                max={CURRENT_YEAR + 1}
                value={yearMax}
                onChange={(e) => setYearMax(Number(e.target.value))}
              />
            </label>
          </fieldset>
        </div>

        {invalid && <p className="settings-error">Max must be greater than or equal to min.</p>}
      </section>

      {filtered.length === 0 ? (
        <div className="empty">
          {invalid ? 'Check your filter values.' : 'No deals match your filters.'}
        </div>
      ) : (
        <div className="grid">
          {filtered.map((deal) => (
            <DealCardShell
              key={deal.key}
              data={deal}
              topRight={<PublicCardActions onNeedSignIn={setSignInFeature} />}
            />
          ))}
        </div>
      )}

      <SignInModal feature={signInFeature} onClose={() => setSignInFeature(null)} />
    </>
  );
}
