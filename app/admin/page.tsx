import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { parseVehicleType } from '../../src/domain/entities/VehicleType.js';
import { getAdminModelsPage } from '../../src/adminService.js';
import { AdminNav } from '../AdminNav.js';
import { ModelsList } from '../ModelsList.js';
import { PageShell } from '../PageShell.js';
import { RecalibrateButton } from '../RecalibrateButton.js';
import { approveRequestAction, rejectRequestAction } from '../request-actions.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  return (
    <PageShell>
      <AdminBody searchParams={searchParams} />
    </PageShell>
  );
}

async function AdminBody({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');

  const vehicleType = parseVehicleType((await searchParams).type);
  const { models, pending } = await getAdminModelsPage(vehicleType);

  return (
    <>
      <h1 className="title">Admin · Models</h1>
      <AdminNav active="models" vehicleType={vehicleType} />
      <p className="subtitle">
        Models are discovered automatically by the weekly crawl — you don&apos;t add them by hand.
        This page is for overrides: disable one to stop tracking it, or lock your own price range
        when the auto-calibrated one looks wrong. Price range and mileage/year feed the deal{' '}
        <em>scoring</em>.
      </p>

      <section className="admin-section">
        <h2 className="settings-title">Pending model requests ({pending.length})</h2>
        {pending.length === 0 ? (
          <div className="empty">No pending requests.</div>
        ) : (
          pending.map((r) => (
            <div key={r.id} className="request-card">
              <strong>
                {r.brand} {r.model}
              </strong>
              {r.note && <span className="req-meta">“{r.note}”</span>}
              <span className="req-meta">by {r.requesterEmail}</span>
              <div className="req-actions">
                <form action={approveRequestAction} className="inline-form">
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn btn-primary btn-small" type="submit">
                    Approve
                  </button>
                </form>
                <form action={rejectRequestAction} className="inline-form">
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn btn-small" type="submit">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="admin-section">
        <h2 className="settings-title">Tracked models ({models.length})</h2>
        <p className="settings-hint">
          Price ranges auto-calibrate from recent market listings on each scan (p25–p75). Turn off
          “Auto-calibrate” on a model to lock your own numbers.
        </p>
        <RecalibrateButton />
        {models.length === 0 ? (
          <div className="empty">No models yet.</div>
        ) : (
          <ModelsList models={models} />
        )}
      </section>
    </>
  );
}
