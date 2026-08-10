import { auth } from '../../auth.js';
import { MOTORCYCLE_CATALOG } from '../../src/catalog/motorcycleCatalog.js';
import { CompareForm } from '../CompareForm.js';
import { PageShell } from '../PageShell.js';

// Reads the database per request (fair-price ranges), so Node runtime + no
// static caching, like the dashboard.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Plain, serializable brand→models list for the form's dependent selects. */
const CATALOG = MOTORCYCLE_CATALOG.map((b) => ({ brand: b.brand, models: [...b.models] }));

export default function ComparePage() {
  return (
    <PageShell>
      <CompareBody />
    </PageShell>
  );
}

async function CompareBody() {
  const session = await auth();
  const signedIn = !!session?.user?.id;
  return (
    <>
      <h1 className="page-title">Compare your bike</h1>
      <p className="subtitle">
        Enter a bike&apos;s details to see how good the deal is — the same rating we put on every
        listing — and get a suggested fair price. No account needed; sign in to unlock AI estimates
        for un-tracked bikes and pasted ads.
      </p>
      <CompareForm catalog={CATALOG} signedIn={signedIn} />
    </>
  );
}
