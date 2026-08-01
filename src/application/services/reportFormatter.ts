import type { DailyReport } from '../../domain/entities/DailyReport.js';
import type { ScoredListing } from '../../domain/entities/ScoredListing.js';

export function formatListingLine(scored: ScoredListing): string {
  const { listing, score, match } = scored;
  const year = listing.year ?? '?';
  const mileage = listing.mileageKm !== undefined ? `${listing.mileageKm}km` : 'mileage n/a';
  return (
    `[${score.total}/100] ${match.criteria.brand} ${match.criteria.model} — ` +
    `${listing.priceMAD} MAD, ${year}, ${mileage}, ${listing.city}\n${listing.url}`
  );
}

export function formatDailyReportText(report: DailyReport): string {
  const lines: string[] = [];
  lines.push(`Moto Deal Scout — daily report (${report.runAt.toISOString()})`);
  lines.push(`Scanned ${report.totalListingsScanned} listings, ${report.newListingsSeen} new.`);

  for (const source of report.sources) {
    const status = source.error ? `ERROR: ${source.error}` : `${source.newListings} new`;
    lines.push(`  - ${source.sourceId}: ${source.listingsFound} found, ${status}`);
  }

  if (report.goodDeals.length === 0) {
    lines.push('', 'No good deals today.');
    return lines.join('\n');
  }

  lines.push('', `${report.goodDeals.length} good deal(s):`);
  for (const deal of report.goodDeals) {
    lines.push('', formatListingLine(deal));
  }
  return lines.join('\n');
}
