import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import type { StoredModel } from '../../src/domain/entities/Model.js';
import { listAllModels } from '../../src/adminService.js';
import { listPendingRequests } from '../../src/requestService.js';
import { SiteHeader } from '../SiteHeader.js';
import { deleteModelAction, saveModelAction } from '../admin-actions.js';
import { approveRequestAction, rejectRequestAction } from '../request-actions.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A create/edit form for one model. `model` undefined = the add-new row. */
function ModelForm({ model }: { model?: StoredModel }) {
  const isNew = !model;
  return (
    <form action={saveModelAction} className="model-form">
      {model && <input type="hidden" name="id" value={model.id} />}
      <div className="model-grid">
        <label>
          <span>Brand</span>
          <input name="brand" defaultValue={model?.brand ?? ''} required />
        </label>
        <label>
          <span>Model</span>
          <input name="model" defaultValue={model?.model ?? ''} required />
        </label>
        <label className="wide">
          <span>Aliases (comma-separated)</span>
          <input name="aliases" defaultValue={model?.aliases.join(', ') ?? ''} />
        </label>
        <label>
          <span>Price min</span>
          <input
            type="number"
            name="priceMin"
            defaultValue={model?.priceRangeMAD.min ?? 0}
            required
          />
        </label>
        <label>
          <span>Price max</span>
          <input
            type="number"
            name="priceMax"
            defaultValue={model?.priceRangeMAD.max ?? 100000}
            required
          />
        </label>
        <label>
          <span>Max mileage km</span>
          <input
            type="number"
            name="maxMileageKm"
            defaultValue={model?.maxMileageKm ?? 30000}
            required
          />
        </label>
        <label>
          <span>Min year</span>
          <input type="number" name="minYear" defaultValue={model?.minYear ?? 2015} required />
        </label>
        <label className="checkbox">
          <input type="checkbox" name="enabled" defaultChecked={model?.enabled ?? true} />
          <span>Enabled</span>
        </label>
      </div>
      <div className="model-actions">
        <button className="btn btn-primary" type="submit">
          {isNew ? 'Add model' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');

  const [models, pending] = await Promise.all([listAllModels(), listPendingRequests()]);

  return (
    <main className="container">
      <SiteHeader />
      <h1 className="title">Admin · Models</h1>
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
        <ModelForm />
      </section>

      <section className="admin-section">
        <h2 className="settings-title">Tracked models ({models.length})</h2>
        {models.length === 0 ? (
          <div className="empty">No models yet.</div>
        ) : (
          models.map((model) => (
            <div key={model.id} className="model-card">
              <div className="model-card-head">
                <strong>
                  {model.brand} {model.model}
                </strong>
                <span className={model.enabled ? 'badge on' : 'badge'}>
                  {model.enabled ? 'enabled' : 'disabled'}
                </span>
                <form action={deleteModelAction} className="inline-form">
                  <input type="hidden" name="id" value={model.id} />
                  <button className="btn btn-small" type="submit">
                    Delete
                  </button>
                </form>
              </div>
              <ModelForm model={model} />
            </div>
          ))
        )}
      </section>
    </main>
  );
}
