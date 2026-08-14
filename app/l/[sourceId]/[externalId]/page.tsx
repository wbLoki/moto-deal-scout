import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseMarketplaceId } from '../../../../src/domain/entities/Listing.js';
import { getScoredListing } from '../../../../src/readModel.js';
import { ListingDetail } from '../../../ListingDetail.js';
import { toDealView } from '../../../dealView.js';
import { getLocale } from '../../../i18n/getLocale.js';
import { PageShell } from '../../../PageShell.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ListingPageProps {
  params: Promise<{ sourceId: string; externalId: string }>;
}

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { sourceId: rawSource, externalId } = await params;
  const sourceId = parseMarketplaceId(decodeURIComponent(rawSource));
  if (!sourceId) return { title: 'Moto Deal Scout' };
  const scored = await getScoredListing(sourceId, decodeURIComponent(externalId));
  if (!scored) return { title: 'Moto Deal Scout' };
  const view = toDealView(scored);
  return {
    title: `${view.brand} ${view.model} — ${view.priceMAD} MAD`,
    description: `${view.brand} ${view.model} in ${view.city}`,
  };
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { sourceId: rawSource, externalId: rawId } = await params;
  const sourceId = parseMarketplaceId(decodeURIComponent(rawSource));
  if (!sourceId) notFound();
  const scored = await getScoredListing(sourceId, decodeURIComponent(rawId));
  if (!scored) notFound();

  const deal = toDealView(scored);
  const locale = await getLocale();
  const feedHref = deal.vehicleType === 'car' ? '/cars' : '/';

  return (
    <PageShell>
      <ListingDetail data={deal} locale={locale} feedHref={feedHref} />
    </PageShell>
  );
}
