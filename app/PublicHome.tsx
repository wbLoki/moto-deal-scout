import Link from 'next/link';
import { SiteHeader } from './SiteHeader.js';
import { DealCardShell, type DealCardData } from './DealCardShell.js';
import { EyeIcon, FlameIcon } from './icons.js';

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
    title: 'Get alerted, not left behind',
    body: 'Create a free account to follow the models you want and get an alert the moment a matching deal appears.',
  },
];

/** Anonymous stand-in for the watch eye: nudges the visitor to sign up. */
function SignInToFollow() {
  return (
    <Link
      href="/signup"
      className="watch-eye"
      title="Sign in to follow this model and get deal alerts"
      aria-label="Sign in to follow this model"
    >
      <EyeIcon size={18} />
    </Link>
  );
}

/**
 * The public homepage shown to anyone not logged in. Unlike the old teaser, it
 * shows the full browsable deal feed (identical cards to the member dashboard),
 * with the follow control replaced by a "sign in" nudge — signup unlocks
 * following models, saved listings and alerts.
 */
export function PublicHome({ deals }: { deals: readonly DealCardData[] }) {
  return (
    <main className="container">
      <SiteHeader />

      <section className="hero hero-compact">
        <h1 className="hero-title">The best motorcycle deals in Morocco, spotted for you.</h1>
        <p className="hero-sub">
          We scan the big Moroccan marketplaces every day, score every listing and tag the good ones
          — browse them all below. Create a free account to follow models, save bikes and get
          alerted the moment a matching deal appears.
        </p>
        <div className="hero-cta">
          <Link href="/signup" className="btn btn-primary">
            Create your free account
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
            Latest deals
          </h2>
        </div>
        {deals.length === 0 ? (
          <div className="empty">No deals to show yet — check back after the next scan.</div>
        ) : (
          <div className="grid">
            {deals.map((deal) => (
              <DealCardShell key={deal.key} data={deal} topRight={<SignInToFollow />} />
            ))}
          </div>
        )}
        <p className="landing-deals-cta">
          <Link href="/signup" className="btn btn-primary">
            Create an account to follow models &amp; get deal alerts
          </Link>
        </p>
      </section>

      <div className="footer">
        Data scraped from Avito.ma, Biker.ma and Moteur.ma. Prices can contain seller typos — always
        verify on the listing before acting.
      </div>
    </main>
  );
}
