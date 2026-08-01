import { loadEnv } from '../../src/config/env.js';

/**
 * Guards the cron routes. Vercel Cron sends the configured CRON_SECRET as a
 * Bearer token; a matching manual call works too. If CRON_SECRET is unset
 * the route is open (fine for local dev, never do this in production).
 *
 * Returns null when the request is authorized, or a 401 Response to return.
 */
export function checkCronAuth(request: Request): Response | null {
  const { CRON_SECRET } = loadEnv();
  if (!CRON_SECRET) return null;

  const header = request.headers.get('authorization');
  if (header === `Bearer ${CRON_SECRET}`) return null;

  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
