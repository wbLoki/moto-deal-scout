import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * libsql database URL. Leave unset for local use and a `file:` URL is
   * derived from DATABASE_PATH. On Vercel, set this to your Turso database
   * URL (`libsql://<db>.turso.io`).
   */
  DATABASE_URL: z.string().min(1).optional(),
  /** Auth token for a remote Turso database. Required when DATABASE_URL is a `libsql://` URL. */
  DATABASE_AUTH_TOKEN: z.string().min(1).optional(),
  /** Local SQLite file path, used only when DATABASE_URL is unset. Created on first run. */
  DATABASE_PATH: z.string().min(1).default('./data/moto-deal-scout.sqlite'),

  /** Optional JSON file overriding src/config/defaultCriteria.ts. See README. */
  CRITERIA_CONFIG_PATH: z.string().min(1).optional(),

  /** Cron expression for the daily scan. Default: 8:00 AM every day. */
  SCAN_CRON_EXPRESSION: z.string().min(1).default('0 8 * * *'),
  /** IANA timezone the cron expression is evaluated in. */
  SCAN_TIMEZONE: z.string().min(1).default('Africa/Casablanca'),

  /** Milliseconds to wait between requests to the same marketplace, to stay polite. */
  SCRAPE_THROTTLE_MS: z.coerce.number().int().nonnegative().default(2000),
  /** Whether Playwright launches Chromium headless (true) or visibly (false, for debugging). */
  PLAYWRIGHT_HEADLESS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  DISCORD_WEBHOOK_URL: z.string().url().optional(),

  /**
   * Shared secret protecting the /api/scan and /api/report routes. Vercel
   * Cron sends it as `Authorization: Bearer <CRON_SECRET>`. If unset, the
   * routes are unprotected — always set it in production.
   */
  CRON_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

type EnvSource = Record<string, string | undefined>;

/** Parses and validates process.env. Throws with a readable message on first bad access. */
export function loadEnv(source: EnvSource = process.env): Env {
  cached ??= parse(source);
  return cached;
}

function parse(source: EnvSource): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

/** Test-only: clear the cached env so a fresh loadEnv() call re-parses. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}
