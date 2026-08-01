import { beforeEach, describe, expect, it } from 'vitest';
import { loadEnv, resetEnvCacheForTests } from '../../src/config/env.js';

describe('loadEnv', () => {
  beforeEach(() => {
    resetEnvCacheForTests();
  });

  it('applies defaults when optional variables are absent', () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_PATH).toBe('./data/moto-deal-scout.sqlite');
    expect(env.SCAN_CRON_EXPRESSION).toBe('0 8 * * *');
    expect(env.SCAN_TIMEZONE).toBe('Africa/Casablanca');
    expect(env.PLAYWRIGHT_HEADLESS).toBe(true);
  });

  it('coerces PLAYWRIGHT_HEADLESS and SCRAPE_THROTTLE_MS from strings', () => {
    const env = loadEnv({ PLAYWRIGHT_HEADLESS: 'false', SCRAPE_THROTTLE_MS: '500' });
    expect(env.PLAYWRIGHT_HEADLESS).toBe(false);
    expect(env.SCRAPE_THROTTLE_MS).toBe(500);
  });

  it('throws a readable error for an invalid NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'bogus' })).toThrow(/Invalid environment configuration/);
  });

  it('throws for a malformed DISCORD_WEBHOOK_URL', () => {
    expect(() => loadEnv({ DISCORD_WEBHOOK_URL: 'not-a-url' })).toThrow(/DISCORD_WEBHOOK_URL/);
  });
});
