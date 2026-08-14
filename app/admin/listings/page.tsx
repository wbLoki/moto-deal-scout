import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '../../../auth.js';
import {
  listScannedListings,
  toScannedDateField,
  type ScannedDateField,
} from '../../../src/adminMetrics.js';
import { parseVehicleType } from '../../../src/domain/entities/VehicleType.js';
import { AdminNav } from '../../AdminNav.js';
import { PageShell } from '../../PageShell.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });

const DATE_FIELD_LABELS: Record<ScannedDateField, string> = {
  scraped_at: 'Scraped',
  posted_at: 'Posted',
  created_at: 'First seen',
};

/** "2026-08-12 09:33" in UTC — compact but keeps the time, which matters here. */
function fmtStamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

interface SearchParams {
  readonly source?: string;
  readonly q?: string;
  readonly field?: string;
  readonly from?: string;
  readonly to?: string;
  readonly page?: string;
  readonly type?: string;
}

export default function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <PageShell>
      <AdminListingsBody searchParams={searchParams} />
    </PageShell>
  );
}

async function AdminListingsBody({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');

  const params = await searchParams;
  const vehicleType = parseVehicleType(params.type);
  const source = params.source && params.source !== 'all' ? params.source : undefined;
  const search = params.q?.trim() || undefined;
  const field = toScannedDateField(params.field);
  const from = params.from?.trim() || undefined;
  const to = params.to?.trim() || undefined;
  const requestedPage = Number.parseInt(params.page ?? '1', 10);

  const { rows, total, sources, page, pageSize, totalPages } = await listScannedListings({
    ...(source ? { source } : {}),
    ...(search ? { search } : {}),
    dateField: field,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page: Number.isNaN(requestedPage) ? 1 : requestedPage,
    pageSize: 50,
    vehicleType,
  });

  // Builds a URL preserving every active filter, with the given overrides.
  // Pass a value of undefined to drop a param. Any change resets to page 1
  // unless `page` is explicitly provided.
  const urlWith = (overrides: Partial<Record<keyof SearchParams, string | undefined>>): string => {
    const base: Record<string, string | undefined> = {
      source,
      q: search,
      field: field === 'scraped_at' ? undefined : field,
      from,
      to,
      type: vehicleType === 'car' ? 'car' : undefined,
    };
    const merged = { ...base, page: undefined, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== '') qs.set(k, v);
    }
    const str = qs.toString();
    return str ? `/admin/listings?${str}` : '/admin/listings';
  };

  const filters = ['all', ...sources];
  const activeFilter = source ?? 'all';
  const hasFilters = Boolean(source || search || from || to);
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = (page - 1) * pageSize + rows.length;

  return (
    <>
      <h1 className="title">Admin · Scan log</h1>
      <AdminNav active="listings" vehicleType={vehicleType} />
      <p className="subtitle">
        Every listing the crawler has stored, newest-scraped first. <strong>Posted</strong> is the
        seller&apos;s ad date on the marketplace (often years old for bikes that have sat unsold),{' '}
        <strong>Scraped</strong> is when we last saw it, and <strong>First seen</strong> is when it
        first entered our database.
      </p>

      <section className="admin-section">
        <nav className="admin-nav" aria-label="Filter by source">
          {filters.map((s) => (
            <Link
              key={s}
              href={urlWith({ source: s === 'all' ? undefined : s })}
              className={s === activeFilter ? 'admin-nav-link active' : 'admin-nav-link'}
            >
              {s === 'all' ? 'All sources' : s}
            </Link>
          ))}
        </nav>

        <form method="get" className="inline-form listings-filters">
          {source ? <input type="hidden" name="source" value={source} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={search ?? ''}
            placeholder="Search title…"
            aria-label="Search listing titles"
          />
          <label>
            <span className="settings-hint">Date:</span>
            <select name="field" defaultValue={field} aria-label="Date field to filter">
              {(Object.keys(DATE_FIELD_LABELS) as ScannedDateField[]).map((f) => (
                <option key={f} value={f}>
                  {DATE_FIELD_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
          <input type="date" name="from" defaultValue={from ?? ''} aria-label="From date" />
          <span className="settings-hint">to</span>
          <input type="date" name="to" defaultValue={to ?? ''} aria-label="To date" />
          <button className="btn btn-small" type="submit">
            Apply
          </button>
          {hasFilters ? (
            <Link className="btn btn-small" href="/admin/listings">
              Clear
            </Link>
          ) : null}
        </form>

        <h2 className="settings-title">
          {total === 0 ? 'No listings match.' : `Showing ${firstRow}–${lastRow} of ${total}`}
          {from || to
            ? ` · ${DATE_FIELD_LABELS[field].toLowerCase()} ${from ?? '…'} → ${to ?? '…'}`
            : ''}
        </h2>

        {rows.length === 0 ? (
          <div className="empty">No listings match.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Title</th>
                    <th>Price</th>
                    <th>Year</th>
                    <th>Mileage</th>
                    <th>City</th>
                    <th>Model</th>
                    <th>Score</th>
                    <th>Posted</th>
                    <th>Scraped</th>
                    <th>First seen</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={`${l.sourceId}:${l.externalId}`}>
                      <td>{l.sourceId}</td>
                      <td>
                        <a href={l.url} target="_blank" rel="noopener noreferrer">
                          {l.title}
                        </a>
                      </td>
                      <td>{madFmt.format(l.priceMAD)}</td>
                      <td>{l.year ?? '—'}</td>
                      <td>{l.mileageKm != null ? `${madFmt.format(l.mileageKm)} km` : '—'}</td>
                      <td>{l.city}</td>
                      <td>{l.modelId}</td>
                      <td>
                        {l.scoreTotal}
                        {l.isGoodDeal ? <span className="badge on"> deal</span> : null}
                      </td>
                      <td>{fmtStamp(l.postedAt)}</td>
                      <td>{fmtStamp(l.scrapedAt)}</td>
                      <td>{fmtStamp(l.firstSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav
              className="inline-form"
              aria-label="Pagination"
              style={{ marginTop: '1rem', alignItems: 'center', gap: '0.75rem' }}
            >
              {page > 1 ? (
                <Link className="btn btn-small" href={urlWith({ page: String(page - 1) })}>
                  ← Prev
                </Link>
              ) : (
                <span className="btn btn-small" aria-disabled="true" style={{ opacity: 0.4 }}>
                  ← Prev
                </span>
              )}
              <span className="settings-hint">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link className="btn btn-small" href={urlWith({ page: String(page + 1) })}>
                  Next →
                </Link>
              ) : (
                <span className="btn btn-small" aria-disabled="true" style={{ opacity: 0.4 }}>
                  Next →
                </span>
              )}
            </nav>
          </>
        )}
      </section>
    </>
  );
}
