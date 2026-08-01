import { runScan } from '../../../src/runners.js';
import { checkCronAuth } from '../_auth.js';

// Scraping needs the Node runtime and real wall-clock time. Bump maxDuration
// as high as your Vercel plan allows (Hobby caps ~60s; Pro allows more).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;

  const report = await runScan();
  return Response.json({
    ok: true,
    runAt: report.runAt.toISOString(),
    totalListingsScanned: report.totalListingsScanned,
    newListingsSeen: report.newListingsSeen,
    goodDeals: report.goodDeals.length,
    sources: report.sources,
  });
}

// Vercel Cron issues GET; POST is handy for manual triggers.
export const GET = handle;
export const POST = handle;
