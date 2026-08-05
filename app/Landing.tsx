import Link from 'next/link';
import { FlameIcon, MotoIcon } from './icons.js';

export interface PublicDeal {
  key: string;
  brand: string;
  model: string;
  priceMAD: number;
  year: number | null;
  mileageKm: number | null;
  city: string;
  sourceId: string;
  url: string;
  imageUrl: string | null;
  tierLabel: string;
  tierLevel: string;
}

const madFmt = new Intl.NumberFormat('fr-MA');

function PublicDealCard({ deal }: { deal: PublicDeal }) {
  return (
    <a className="card landing-card" href={deal.url} target="_blank" rel="noopener noreferrer">
      {deal.imageUrl ? (
        <img
          className="card-media"
          src={deal.imageUrl}
          alt={`${deal.brand} ${deal.model}`}
          loading="lazy"
        />
      ) : (
        <div className="card-media-empty">No image</div>
      )}
      <div className="card-body">
        <div className="card-top">
          <h3 className="card-title">
            {deal.brand} {deal.model}
          </h3>
          <span className={`tag tag-${deal.tierLevel}`}>{deal.tierLabel}</span>
        </div>
        <div className="price">{madFmt.format(deal.priceMAD)} MAD</div>
        <div className="meta">
          <span>{deal.year ?? 'Year n/a'}</span>
          <span>{deal.mileageKm !== null ? `${deal.mileageKm} km` : 'km n/a'}</span>
          <span>{deal.city}</span>
        </div>
        <div className="badges">
          <span className="badge">{deal.sourceId}</span>
        </div>
      </div>
    </a>
  );
}

const FEATURES = [
  {
    title: 'Every day, automatically',
    body: 'We scan Avito, Biker.ma and Moteur.ma each morning so you never have to refresh a marketplace again.',
  },
  {
    title: 'Scored, not just listed',
    body: 'Each bike is rated on price, mileage, year and city, then tagged Hot / Very good / Good so winners stand out.',
  },
  {
    title: 'Your models, your budget',
    body: 'Follow the models you want, set a budget and year range, and get a feed tuned to exactly what you’re after.',
  },
];

export function Landing({ hotDeals }: { hotDeals: readonly PublicDeal[] }) {
  return (
    <main className="landing">
      <header className="landing-nav">
        <span className="brand">
          <MotoIcon size={22} />
          Moto Deal Scout
        </span>
        <div className="landing-nav-actions">
          <Link href="/login" className="btn btn-small">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary btn-small">
            Create account
          </Link>
        </div>
      </header>

      <section className="hero">
        <h1 className="hero-title">The best motorcycle deals in Morocco, spotted for you.</h1>
        <p className="hero-sub">
          Moto Deal Scout scans the big Moroccan marketplaces every day, scores every listing, and
          tags the good ones — so you find a great bike in seconds instead of scrolling for hours.
        </p>
        <div className="hero-cta">
          <Link href="/signup" className="btn btn-primary">
            Get started — it’s free
          </Link>
          <Link href="/login" className="btn">
            Sign in
          </Link>
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="landing-deals">
        <div className="deal-section-head">
          <h2>
            <FlameIcon className="icon-lead" />
            Hottest deals right now
          </h2>
        </div>
        {hotDeals.length === 0 ? (
          <div className="empty">No deals to show yet — check back after the next scan.</div>
        ) : (
          <div className="grid">
            {hotDeals.map((deal) => (
              <PublicDealCard key={deal.key} deal={deal} />
            ))}
          </div>
        )}
        <p className="landing-deals-cta">
          <Link href="/signup" className="btn btn-primary">
            Create an account to see the full feed
          </Link>
        </p>
      </section>

      <footer className="footer landing-footer">
        Listings from Avito.ma, Biker.ma and Moteur.ma. Prices can contain seller typos — always
        verify on the listing before acting.
      </footer>
    </main>
  );
}
