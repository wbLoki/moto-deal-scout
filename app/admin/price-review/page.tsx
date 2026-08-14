import { redirect } from 'next/navigation';
import { auth } from '../../../auth.js';
import { parseVehicleType } from '../../../src/domain/entities/VehicleType.js';
import { AdminNav } from '../../AdminNav.js';
import { PageShell } from '../../PageShell.js';
import { PriceReview } from '../../PriceReview.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A batch of Claude calls can take a while; give it the full function budget.
export const maxDuration = 60;

export default function PriceReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  return (
    <PageShell>
      <PriceReviewBody searchParams={searchParams} />
    </PageShell>
  );
}

async function PriceReviewBody({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');
  const vehicleType = parseVehicleType((await searchParams).type);

  return (
    <>
      <h1 className="title">Admin · Price review</h1>
      <AdminNav active="price-review" vehicleType={vehicleType} />
      <p className="subtitle">
        Ask Claude to sanity-check our calibrated fair ranges against the Moroccan used market. It
        reviews a batch at a time and flags anything that looks off — advisory only, it never
        changes a range.
      </p>
      <PriceReview vehicleType={vehicleType} />
    </>
  );
}
