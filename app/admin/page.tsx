import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { listAllModels } from '../../src/adminService.js';
import { listPendingRequests } from '../../src/requestService.js';
import { AddModelPicker } from '../AddModelPicker.js';
import { AdminNav } from '../AdminNav.js';
import { ModelsList } from '../ModelsList.js';
import { RecalibrateButton } from '../RecalibrateButton.js';
import { SiteHeader } from '../SiteHeader.js';
import { approveRequestAction, rejectRequestAction } from '../request-actions.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');

  const [models, pending] = await Promise.all([listAllModels(), listPendingRequests()]);

  return (
    <main className="container">
      <SiteHeader />
      <h1 className="title">Admin · Models</h1>
      <AdminNav active="models" />
      <p className="subtitle">
        These are the models the daily scan searches for. Disable one to stop tracking it without
        losing its settings. Price range and mileage/year here feed the deal <em>scoring</em>.
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
        <h2 className="settings-title">Add a model</h2>
        <p className="settings-hint">
          Pick a brand and model from the catalog (or type your own). Aliases are suggested
          automatically.
        </p>
        <AddModelPicker />
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
    </main>
  );
}
