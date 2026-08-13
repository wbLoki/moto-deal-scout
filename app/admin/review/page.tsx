import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '../../../auth.js';
import {
  listIncompleteListings,
  listModelOptions,
  listReviewQueue,
  type IncompleteListing,
  type Paged,
  type ReviewListing,
} from '../../../src/reviewQueue.js';
import { parseVehicleType } from '../../../src/domain/entities/VehicleType.js';
import { AdminNav } from '../../AdminNav.js';
import { PageShell } from '../../PageShell.js';
import { dismissReviewAction, promoteReviewAction, updateListingAction } from './actions.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });

const inputStyle = {
  padding: '0.35rem 0.5rem',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  background: 'var(--bg)',
  color: 'inherit',
  maxWidth: '7rem',
} as const;

function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

interface SearchParams {
  readonly rp?: string;
  readonly ip?: string;
  readonly type?: string;
}

export default function AdminReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <PageShell>
      <AdminReviewBody searchParams={searchParams} />
    </PageShell>
  );
}

async function AdminReviewBody({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');

  const params = await searchParams;
  const vehicleType = parseVehicleType(params.type);
  const reviewPage = toInt(params.rp);
  const incompletePage = toInt(params.ip);

  const [queue, incomplete, models] = await Promise.all([
    listReviewQueue({ page: reviewPage, pageSize: 25, vehicleType }),
    listIncompleteListings({ page: incompletePage, pageSize: 25, vehicleType }),
    listModelOptions(vehicleType),
  ]);

  return (
    <>
      <h1 className="title">Admin · Review</h1>
      <AdminNav active="review" vehicleType={vehicleType} />
      <p className="subtitle">
        Listings the crawler set aside instead of showing users. <strong>Missing model</strong>{' '}
        names a brand we know but no model in the catalog — add or pick a model to publish it.{' '}
        <strong>Incomplete data</strong> is already live but missing a field you can fill from the
        listing page.
      </p>

      <section className="admin-section">
        <h2 className="settings-title">
          Missing model ({queue.total}) — add to catalog &amp; publish
        </h2>
        {queue.rows.length === 0 ? (
          <div className="empty">Nothing waiting. New unknown-brand-model listings land here.</div>
        ) : (
          queue.rows.map((r) => (
            <ReviewCard
              key={`${r.sourceId}:${r.externalId}`}
              row={r}
              models={models}
              vehicleType={vehicleType}
            />
          ))
        )}
        <Pager
          paged={queue}
          param="rp"
          other={['ip', String(incomplete.page)]}
          vehicleType={vehicleType}
        />
      </section>

      <section className="admin-section">
        <h2 className="settings-title">Incomplete data ({incomplete.total}) — fill the gaps</h2>
        {incomplete.rows.length === 0 ? (
          <div className="empty">
            {vehicleType === 'car'
              ? 'Every stored listing has a year and mileage.'
              : 'Every stored listing has a year, mileage, and displacement.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Title</th>
                  <th>Model</th>
                  <th>Price</th>
                  <th>Year</th>
                  <th>Mileage</th>
                  {vehicleType !== 'car' && <th>CC</th>}
                  <th>Save</th>
                </tr>
              </thead>
              <tbody>
                {incomplete.rows.map((l) => (
                  <IncompleteRow key={`${l.sourceId}:${l.externalId}`} row={l} hideCc={vehicleType === 'car'} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          paged={incomplete}
          param="ip"
          other={['rp', String(queue.page)]}
          vehicleType={vehicleType}
        />
      </section>
    </>
  );
}

function ReviewCard({
  row,
  models,
  vehicleType,
}: {
  row: ReviewListing;
  models: { id: string; label: string }[];
  vehicleType: 'motorcycle' | 'car';
}) {
  return (
    <div className="request-card" style={{ display: 'block' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <a href={row.url} target="_blank" rel="noopener noreferrer">
          <strong>{row.title}</strong>
        </a>{' '}
        <span className="req-meta">
          {row.sourceId} · {madFmt.format(row.priceMAD)} MAD · {row.city}
          {row.detectedBrand ? ` · brand: ${row.detectedBrand}` : ''} · posted {fmtDay(row.postedAt)}
        </span>
      </div>

      <form
        action={promoteReviewAction}
        className="inline-form"
        style={{ flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}
      >
        <input type="hidden" name="sourceId" value={row.sourceId} />
        <input type="hidden" name="externalId" value={row.externalId} />
        <input type="hidden" name="vehicleType" value={vehicleType} />

        <label className="settings-hint" style={{ display: 'inline-flex', gap: '0.35rem' }}>
          Model:
          <select name="modelId" defaultValue="__new__" style={{ ...inputStyle, maxWidth: '14rem' }}>
            <option value="__new__">— New model —</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <input
          type="text"
          name="newBrand"
          defaultValue={row.detectedBrand ?? ''}
          placeholder="Brand"
          aria-label="New model brand"
          style={inputStyle}
        />
        <input
          type="text"
          name="newModel"
          placeholder="Model (e.g. MT-09)"
          aria-label="New model name"
          style={{ ...inputStyle, maxWidth: '10rem' }}
        />

        <input type="text" name="year" defaultValue={row.year ?? ''} placeholder="Year" aria-label="Year" style={{ ...inputStyle, maxWidth: '5rem' }} />
        <input type="text" name="mileageKm" defaultValue={row.mileageKm ?? ''} placeholder="Km" aria-label="Mileage" style={{ ...inputStyle, maxWidth: '6rem' }} />
        {vehicleType !== 'car' && (
          <input type="text" name="displacementCc" defaultValue={row.displacementCc ?? ''} placeholder="CC" aria-label="Displacement" style={{ ...inputStyle, maxWidth: '5rem' }} />
        )}

        <button className="btn btn-primary btn-small" type="submit">
          Publish
        </button>
      </form>

      <form action={dismissReviewAction} className="inline-form" style={{ marginTop: '0.4rem' }}>
        <input type="hidden" name="sourceId" value={row.sourceId} />
        <input type="hidden" name="externalId" value={row.externalId} />
        <button className="btn btn-small" type="submit">
          Dismiss
        </button>
      </form>
    </div>
  );
}

function IncompleteRow({ row, hideCc }: { row: IncompleteListing; hideCc: boolean }) {
  return (
    <tr>
      <td>{row.sourceId}</td>
      <td>
        <a href={row.url} target="_blank" rel="noopener noreferrer">
          {row.title}
        </a>
      </td>
      <td>{row.modelId}</td>
      <td>{madFmt.format(row.priceMAD)}</td>
      <td colSpan={4}>
        <form action={updateListingAction} className="inline-form" style={{ gap: '0.4rem', alignItems: 'center' }}>
          <input type="hidden" name="sourceId" value={row.sourceId} />
          <input type="hidden" name="externalId" value={row.externalId} />
          <input type="text" name="year" defaultValue={row.year ?? ''} placeholder="Year" aria-label="Year" style={{ ...inputStyle, maxWidth: '5rem' }} />
          <input type="text" name="mileageKm" defaultValue={row.mileageKm ?? ''} placeholder="Km" aria-label="Mileage" style={{ ...inputStyle, maxWidth: '6rem' }} />
          {!hideCc && (
            <input type="text" name="displacementCc" defaultValue={row.displacementCc ?? ''} placeholder="CC" aria-label="Displacement" style={{ ...inputStyle, maxWidth: '5rem' }} />
          )}
          <button className="btn btn-small" type="submit">
            Save
          </button>
        </form>
      </td>
    </tr>
  );
}

function Pager<T>({
  paged,
  param,
  other,
  vehicleType,
}: {
  paged: Paged<T>;
  param: string;
  /** [name, value] of the other section's page param, preserved across clicks. */
  other: [string, string];
  vehicleType: 'motorcycle' | 'car';
}) {
  if (paged.totalPages <= 1) return null;
  const href = (p: number): string => {
    const qs = new URLSearchParams();
    qs.set(param, String(p));
    if (other[1] && other[1] !== '1') qs.set(other[0], other[1]);
    if (vehicleType === 'car') qs.set('type', 'car');
    return `/admin/review?${qs.toString()}`;
  };
  return (
    <nav className="inline-form" aria-label="Pagination" style={{ marginTop: '0.75rem', alignItems: 'center', gap: '0.75rem' }}>
      {paged.page > 1 ? (
        <Link className="btn btn-small" href={href(paged.page - 1)}>
          ← Prev
        </Link>
      ) : (
        <span className="btn btn-small" aria-disabled="true" style={{ opacity: 0.4 }}>
          ← Prev
        </span>
      )}
      <span className="settings-hint">
        Page {paged.page} of {paged.totalPages}
      </span>
      {paged.page < paged.totalPages ? (
        <Link className="btn btn-small" href={href(paged.page + 1)}>
          Next →
        </Link>
      ) : (
        <span className="btn btn-small" aria-disabled="true" style={{ opacity: 0.4 }}>
          Next →
        </span>
      )}
    </nav>
  );
}

function toInt(value: string | undefined): number {
  const n = Number.parseInt(value ?? '1', 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}
