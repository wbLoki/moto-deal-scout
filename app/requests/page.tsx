import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { listUserRequests } from '../../src/requestService.js';
import { PageShell } from '../PageShell.js';
import { RequestForm } from './RequestForm.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function RequestsPage() {
  return (
    <PageShell>
      <RequestsBody />
    </PageShell>
  );
}

async function RequestsBody() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const requests = await listUserRequests(session.user.id);

  return (
    <>
      <h1 className="title">Request a model</h1>
      <p className="subtitle">
        Suggest a motorcycle model for the scanner to track. An admin reviews and approves it before
        it&apos;s added to the daily scan.
      </p>

      <section className="admin-section">
        <RequestForm />
      </section>

      <section className="admin-section">
        <h2 className="settings-title">Your requests ({requests.length})</h2>
        {requests.length === 0 ? (
          <div className="empty">You haven&apos;t requested any models yet.</div>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="request-card">
              <strong>
                {r.brand} {r.model}
              </strong>
              {r.note && <span className="req-meta">{r.note}</span>}
              <span className={`status-pill ${r.status}`}>{r.status}</span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
