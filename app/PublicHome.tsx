import Link from 'next/link';
import { SiteHeader } from './SiteHeader.js';
import { PublicFeed } from './PublicFeed.js';
import type { DealCardData } from './DealCardShell.js';

/**
 * The public homepage shown to anyone not logged in. It mirrors the member
 * dashboard — the same filter panel, search bar and card grid — so browsing
 * feels like the real app. A slim banner explains what signing in unlocks
 * (following models, saving bikes, and deal alerts).
 */
export function PublicHome({ deals }: { deals: readonly DealCardData[] }) {
  return (
    <main className="container">
      <SiteHeader />

      <div className="signup-banner">
        <span>
          Browse every deal free. <strong>Create an account</strong> to follow models, save bikes
          and get alerted the moment a matching deal appears.
        </span>
        <div className="signup-banner-actions">
          <Link href="/signup" className="btn btn-primary btn-small">
            Create account
          </Link>
          <Link href="/login" className="btn btn-small">
            Sign in
          </Link>
        </div>
      </div>

      <PublicFeed deals={deals} />

      <div className="footer">
        Data scraped from Avito.ma, Biker.ma and Moteur.ma. Prices can contain seller typos — always
        verify on the listing before acting.
      </div>
    </main>
  );
}
