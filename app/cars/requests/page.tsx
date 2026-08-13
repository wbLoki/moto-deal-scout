import { redirect } from 'next/navigation';
import { auth } from '../../../auth.js';
import { listUserRequests } from '../../../src/requestService.js';
import { PageShell } from '../../PageShell.js';
import { RequestForm } from '../../requests/RequestForm.js';
import { dictionaryFor, getLocale } from '../../i18n/getLocale.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function CarsRequestsPage() {
  return (
    <PageShell>
      <RequestsBody />
    </PageShell>
  );
}

async function RequestsBody() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const requests = (await listUserRequests(session.user.id)).filter((r) => r.vehicleType === 'car');
  const locale = await getLocale();
  const t = dictionaryFor(locale);

  return (
    <>
      <h1 className="title">{t.requests.title}</h1>
        <p className="subtitle">{t.requests.subtitleCar}</p>

      <section className="admin-section">
        <RequestForm locale={locale} vehicleType="car" />
      </section>

      <section className="admin-section">
        <h2 className="settings-title">{t.requests.yourRequests(requests.length)}</h2>
        {requests.length === 0 ? (
          <div className="empty">{t.requests.none}</div>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="request-card">
              <strong>
                {r.brand} {r.model}
              </strong>
              {r.note && <span className="req-meta">{r.note}</span>}
              <span className={`status-pill ${r.status}`}>{t.requests.status[r.status]}</span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
