import Link from 'next/link';
import { PublicFeed } from './PublicFeed.js';
import type { DealView } from './dealView.js';
import type { SortKey } from './dealSort.js';
import type { DealFacets } from '../src/domain/interfaces/ListingRepository.js';
import { dictionaryFor, getLocale } from './i18n/getLocale.js';

/**
 * The public homepage shown to anyone not logged in. It mirrors the member
 * dashboard — the same filter panel, search bar and card grid — so browsing
 * feels like the real app. A slim banner explains what signing in unlocks
 * (following models, saving bikes, and deal alerts).
 *
 * Header chrome lives in {@link PageShell}; this is body-only.
 */
export async function PublicHome({
  initialDeals,
  initialTotal,
  initialSort,
  facets,
}: {
  initialDeals: readonly DealView[];
  initialTotal: number;
  initialSort: SortKey;
  facets: DealFacets;
}) {
  const locale = await getLocale();
  const t = dictionaryFor(locale);
  return (
    <>
      <div className="signup-banner">
        <span>
          {t.home.bannerBefore}
          <strong>{t.home.bannerStrong}</strong>
          {t.home.bannerAfter}
        </span>
        <div className="signup-banner-actions">
          <Link href="/signup" className="btn btn-primary btn-small">
            {t.nav.createAccount}
          </Link>
          <Link href="/login" className="btn btn-small">
            {t.nav.signIn}
          </Link>
        </div>
      </div>

      <PublicFeed
        initialDeals={initialDeals}
        initialTotal={initialTotal}
        initialSort={initialSort}
        facets={facets}
        locale={locale}
      />

      <div className="footer">{t.home.footer}</div>
    </>
  );
}
