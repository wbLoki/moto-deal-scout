import type { Listing, MarketplaceId } from '../entities/Listing.js';
import type { ModelCriteria } from '../entities/SearchCriteria.js';

/**
 * A single query dispatched to a marketplace source: search for a given
 * brand/model (using its aliases too, if the source supports free-text
 * search) and return whatever listings come back. The source is not
 * expected to filter or score results — that's the fuzzy matcher's and
 * scorer's job. It should just translate the query into site-specific
 * search parameters and normalize the raw HTML into `Listing` objects.
 */
export interface SourceQuery {
  /**
   * The model to search for. Omit to browse the marketplace's whole
   * motorcycle category unfiltered — that's the discovery crawl, which
   * finds models nobody has told us about yet.
   */
  readonly criteria?: ModelCriteria;
  /**
   * Overrides the source's default page depth. Targeted per-model searches
   * only need the first few pages; a discovery crawl walks the category to
   * the end.
   */
  readonly maxPages?: number;
}

/**
 * Implement this for every marketplace we scrape. Keep site-specific
 * details (selectors, URL formats) entirely inside the implementation so
 * adding a new marketplace never touches the rest of the app.
 */
export interface MarketplaceSource {
  readonly id: MarketplaceId;
  readonly name: string;

  /** Fetch listings matching a single model query. May return an empty array. */
  fetchListings(query: SourceQuery): Promise<Listing[]>;

  /** Release any held resources (browser/context). Safe to call multiple times. */
  dispose(): Promise<void>;
}
