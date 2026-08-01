import { runReport } from '../../../src/runners.js';
import { checkCronAuth } from '../_auth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function handle(request: Request): Promise<Response> {
  const unauthorized = checkCronAuth(request);
  if (unauthorized) return unauthorized;

  const report = await runReport();
  return Response.json({
    ok: true,
    runAt: report.runAt.toISOString(),
    goodDeals: report.goodDeals.length,
  });
}

export const GET = handle;
export const POST = handle;
