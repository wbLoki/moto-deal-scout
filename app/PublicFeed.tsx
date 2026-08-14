'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { BrowseSidebar } from './BrowseSidebar.js';
import { DealCardShell } from './DealCardShell.js';
import { DealSearchBar } from './DealSearchBar.js';
import { SortSelect } from './SortSelect.js';
import { Pagination } from './Pagination.js';
import { SignInModal } from './SignInModal.js';
import { PAGE_SIZE, type SortKey } from './dealSort.js';
import { MIN_YEAR, ratingFilterOptions, yearOptions, type FilterOption } from './dealFilters.js';
import { MultiSelect } from './MultiSelect.js';
import { BookmarkIcon } from './icons.js';
import { fetchPublicDealsPageAction } from './deal-actions.js';
import type { DealView } from './dealView.js';
import type { PublicDealsInput } from '../src/readModel.js';
import type { DealFacets } from '../src/domain/interfaces/ListingRepository.js';
import type { DealTierLevel } from '../src/domain/services/dealTier.js';
import { useT } from './i18n/I18nProvider.js';
import type { SignInFeature } from './i18n/en.js';
import type { Locale } from './i18n/locales.js';
import type { FuelType, GearboxType, VehicleType } from '../src/domain/entities/VehicleType.js';
import { FUEL_TYPES, GEARBOX_TYPES } from '../src/domain/entities/VehicleType.js';

const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR + 1;
const YEARS = yearOptions();
const SEARCH_DEBOUNCE_MS = 300;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/**
 * The members-only controls as they appear for anonymous visitors: clicking
 * either prompts sign-in rather than navigating away.
 */
function PublicCardActions({
  onNeedSignIn,
  locale,
}: {
  onNeedSignIn: (feature: SignInFeature) => void;
  locale: Locale;
}) {
  const t = useT(locale);
  return (
    <div className="card-actions">
      <button
        type="button"
        className="watch-eye"
        title={t.card.save}
        aria-label={t.card.save}
        onClick={() => onNeedSignIn('save')}
      >
        <BookmarkIcon size={16} />
      </button>
    </div>
  );
}

/**
 * The public deal feed: search, sort, filters (collapsed behind a toggle on
 * small screens) and a paginated grid. Filtering, sorting and pagination all run in
 * SQL on the server — the browser only holds the page it shows — so anonymous
 * visitors can browse the entire catalog, not just a capped teaser. Signing in
 * is what unlocks a persisted range, following, saving and alerts.
 */
export function PublicFeed({
  initialDeals,
  initialTotal,
  initialSort,
  facets,
  locale,
  vehicleType = 'motorcycle',
}: {
  initialDeals: readonly DealView[];
  initialTotal: number;
  initialSort: SortKey;
  facets: DealFacets;
  locale: Locale;
  vehicleType?: VehicleType;
}) {
  const t = useT(locale);
  const priceCap = useMemo(
    () => roundUp(Math.max(50000, facets.maxPrice), 5000),
    [facets.maxPrice],
  );
  const kmCap = useMemo(
    () => (facets.maxMileage > 0 ? roundUp(facets.maxMileage, 5000) : 200000),
    [facets.maxMileage],
  );
  const ccCap = useMemo(
    () => (facets.maxCc > 0 ? roundUp(facets.maxCc, 50) : 1300),
    [facets.maxCc],
  );
  const brandOptions = useMemo<FilterOption[]>(
    () => facets.brands.map((b) => ({ value: b.toLowerCase(), label: b })),
    [facets.brands],
  );
  const cityOptions = useMemo<FilterOption[]>(
    () => facets.cities.map((c) => ({ value: c.toLowerCase(), label: titleCase(c) })),
    [facets.cities],
  );

  const [deals, setDeals] = useState<readonly DealView[]>(initialDeals);
  const [total, setTotal] = useState(initialTotal);
  const [isPending, startTransition] = useTransition();

  const [signInFeature, setSignInFeature] = useState<SignInFeature | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [budgetMin, setBudgetMin] = useState(0);
  const [budgetMax, setBudgetMax] = useState(priceCap);
  const [yearMin, setYearMin] = useState(MIN_YEAR);
  const [yearMax, setYearMax] = useState(MAX_YEAR);
  const [kmMin, setKmMin] = useState(0);
  const [kmMax, setKmMax] = useState(kmCap);
  const [ccMin, setCcMin] = useState(0);
  const [ccMax, setCcMax] = useState(ccCap);
  const [debouncedBudgetMin, setDebouncedBudgetMin] = useState(0);
  const [debouncedBudgetMax, setDebouncedBudgetMax] = useState(priceCap);
  const [debouncedKmMin, setDebouncedKmMin] = useState(0);
  const [debouncedKmMax, setDebouncedKmMax] = useState(kmCap);
  const [debouncedCcMin, setDebouncedCcMin] = useState(0);
  const [debouncedCcMax, setDebouncedCcMax] = useState(ccCap);
  const [ratings, setRatings] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [brandsSel, setBrandsSel] = useState<string[]>([]);
  const [fuelTypes, setFuelTypes] = useState<string[]>([]);
  const [gearboxes, setGearboxes] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const isCar = vehicleType === 'car';

  const invalid =
    debouncedBudgetMax < debouncedBudgetMin ||
    yearMax < yearMin ||
    debouncedKmMax < debouncedKmMin ||
    debouncedCcMax < debouncedCcMin;
  const resetPage = () => setPage(1);

  const resetFilters = () => {
    setQuery('');
    setBudgetMin(0);
    setBudgetMax(priceCap);
    setYearMin(MIN_YEAR);
    setYearMax(MAX_YEAR);
    setKmMin(0);
    setKmMax(kmCap);
    setCcMin(0);
    setCcMax(ccCap);
    setRatings([]);
    setCities([]);
    setBrandsSel([]);
    resetPage();
  };

  // Debounce search + numeric filters so typing doesn't hit the server per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setDebouncedBudgetMin(budgetMin);
      setDebouncedBudgetMax(budgetMax);
      setDebouncedKmMin(kmMin);
      setDebouncedKmMax(kmMax);
      setDebouncedCcMin(ccMin);
      setDebouncedCcMax(ccMax);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, budgetMin, budgetMax, kmMin, kmMax, ccMin, ccMax]);

  // Fetch the exact page from the server whenever a control changes. The first
  // render is skipped — its data arrived server-rendered as props.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (invalid) {
      setDeals([]);
      setTotal(0);
      return;
    }
    const input: PublicDealsInput = {
      search: debouncedQuery.trim(),
      budgetMin: debouncedBudgetMin,
      budgetMax: debouncedBudgetMax,
      yearMin,
      yearMax,
      mileageMin: debouncedKmMin,
      mileageMax: debouncedKmMax >= kmCap ? 0 : debouncedKmMax,
      ccMin: isCar ? 0 : debouncedCcMin,
      ccMax: isCar ? 0 : debouncedCcMax >= ccCap ? 0 : debouncedCcMax,
      fuelTypes: isCar ? (fuelTypes as FuelType[]) : [],
      gearboxes: isCar ? (gearboxes as GearboxType[]) : [],
      ratings,
      cities,
      brands: brandsSel,
      sort,
      page,
      vehicleType,
    };
    startTransition(async () => {
      const res = await fetchPublicDealsPageAction(input);
      if (res.ok) {
        setDeals(res.deals);
        setTotal(res.total);
      }
    });
  }, [
    debouncedQuery,
    sort,
    page,
    debouncedBudgetMin,
    debouncedBudgetMax,
    yearMin,
    yearMax,
    debouncedKmMin,
    debouncedKmMax,
    debouncedCcMin,
    debouncedCcMax,
    ratings,
    cities,
    brandsSel,
    fuelTypes,
    gearboxes,
    invalid,
    kmCap,
    ccCap,
    vehicleType,
    isCar,
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filterCount = ratings.length + brandsSel.length + cities.length;

  return (
    <div className="browse">
      <BrowseSidebar
        locale={locale}
        filterCount={filterCount}
        search={<DealSearchBar locale={locale} value={query} onChange={setQuery} />}
        sort={
          <SortSelect
            locale={locale}
            value={sort}
            onChange={(v) => {
              setSort(v);
              resetPage();
            }}
          />
        }
      >
        <div className="filters-head">
          <h3 className="filters-title">{t.filters.title}</h3>
          <button type="button" className="filters-reset" onClick={resetFilters}>
            {t.common.reset}
          </button>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-title">{t.filters.budget}</h3>
          <div className="sidebar-row">
            <label>
              <span>{t.common.min}</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={budgetMin}
                onChange={(e) => setBudgetMin(Number(e.target.value))}
              />
            </label>
            <label>
              <span>{t.common.max}</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={budgetMax}
                onChange={(e) => setBudgetMax(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-title">{t.filters.year}</h3>
          <div className="sidebar-row">
            <label>
              <span>{t.common.from}</span>
              <select
                value={yearMin}
                onChange={(e) => {
                  setYearMin(Number(e.target.value));
                  resetPage();
                }}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t.common.to}</span>
              <select
                value={yearMax}
                onChange={(e) => {
                  setYearMax(Number(e.target.value));
                  resetPage();
                }}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-title">{t.filters.mileage}</h3>
          <div className="sidebar-row">
            <label>
              <span>{t.common.min}</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={kmMin}
                onChange={(e) => setKmMin(Number(e.target.value))}
              />
            </label>
            <label>
              <span>{t.common.max}</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={kmMax}
                onChange={(e) => setKmMax(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        {!isCar && (
        <div className="sidebar-section">
          <h3 className="sidebar-title">{t.filters.displacement}</h3>
          <div className="sidebar-row">
            <label>
              <span>{t.common.min}</span>
              <input
                type="number"
                min={0}
                step={50}
                value={ccMin}
                onChange={(e) => setCcMin(Number(e.target.value))}
              />
            </label>
            <label>
              <span>{t.common.max}</span>
              <input
                type="number"
                min={0}
                step={50}
                value={ccMax}
                onChange={(e) => setCcMax(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
        )}

        {isCar && (
          <>
            <MultiSelect
              locale={locale}
              label={t.filters.fuel}
              options={FUEL_TYPES.map((f) => ({ value: f, label: t.filters[f] }))}
              selected={fuelTypes}
              onChange={(v) => {
                setFuelTypes(v);
                resetPage();
              }}
              allLabel={t.filters.allFuels}
            />
            <MultiSelect
              locale={locale}
              label={t.filters.gearbox}
              options={GEARBOX_TYPES.map((g) => ({ value: g, label: t.filters[g] }))}
              selected={gearboxes}
              onChange={(v) => {
                setGearboxes(v);
                resetPage();
              }}
              allLabel={t.filters.allGearboxes}
            />
          </>
        )}

        <MultiSelect
          locale={locale}
          label={t.filters.dealRating}
          options={ratingFilterOptions((v) => t.tiers[v as DealTierLevel])}
          selected={ratings}
          onChange={(v) => {
            setRatings(v);
            resetPage();
          }}
          allLabel={t.filters.allRatings}
        />

        <MultiSelect
          locale={locale}
          label={t.filters.brand}
          options={brandOptions}
          selected={brandsSel}
          onChange={(v) => {
            setBrandsSel(v);
            resetPage();
          }}
          allLabel={t.filters.allBrands}
        />

        <MultiSelect
          locale={locale}
          label={t.filters.city}
          options={cityOptions}
          selected={cities}
          onChange={(v) => {
            setCities(v);
            resetPage();
          }}
          allLabel={t.filters.allCities}
        />

        {invalid && <p className="settings-error">{t.filters.rangeInvalid}</p>}
      </BrowseSidebar>

      <div className="browse-main">
        <div className="browse-count">{t.filters.listingCount(total)}</div>

        <div className="grid" aria-busy={isPending}>
          {deals.map((deal) => (
            <DealCardShell
              key={deal.key}
              data={deal}
              locale={locale}
              topRight={<PublicCardActions locale={locale} onNeedSignIn={setSignInFeature} />}
            />
          ))}
        </div>

        {deals.length === 0 && (
          <div className="empty">{invalid ? t.filters.checkFilters : t.filters.noMatch}</div>
        )}

        <Pagination
          locale={locale}
          page={Math.min(page, pageCount)}
          pageCount={pageCount}
          onPage={setPage}
        />
      </div>

      <SignInModal
        locale={locale}
        feature={signInFeature}
        onClose={() => setSignInFeature(null)}
      />
    </div>
  );
}
