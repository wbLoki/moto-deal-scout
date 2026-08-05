import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordNotificationProvider } from '../../src/infrastructure/notifications/DiscordNotificationProvider.js';
import type { DailyReport } from '../../src/domain/entities/DailyReport.js';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
import { makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

const silentLogger = pino({ level: 'silent' });

function buildScored(): ScoredListing {
  return {
    listing: makeListing(),
    match: { criteria: makeModelCriteria(), confidence: 0.9 },
    score: { price: 30, mileage: 20, year: 15, city: 10, total: 75, reasons: ['good price'] },
    isGoodDeal: true,
  };
}

describe('DiscordNotificationProvider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when no webhook URL is configured', async () => {
    const provider = new DiscordNotificationProvider(undefined, silentLogger);
    await provider.notifyGoodDeals([buildScored()]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts an embed per good deal to the webhook URL', async () => {
    const provider = new DiscordNotificationProvider(
      'https://discord.com/api/webhooks/x/y',
      silentLogger,
    );
    await provider.notifyGoodDeals([buildScored()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/x/y');
    const body = JSON.parse(init.body as string) as { embeds: unknown[] };
    expect(body.embeds).toHaveLength(1);
  });

  it('does not call the webhook for an empty deals list from the dispatcher path', async () => {
    const provider = new DiscordNotificationProvider(
      'https://discord.com/api/webhooks/x/y',
      silentLogger,
    );
    await provider.notifyGoodDeals([]);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it('sends the daily report summary even with zero good deals', async () => {
    const provider = new DiscordNotificationProvider(
      'https://discord.com/api/webhooks/x/y',
      silentLogger,
    );
    const report: DailyReport = {
      runAt: new Date(),
      sources: [{ sourceId: 'avito', listingsFound: 10, newListings: 2, error: undefined }],
      totalListingsScanned: 10,
      newListingsSeen: 2,
      goodDeals: [],
      priceDrops: [],
    };
    await provider.sendDailyReport(report);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the webhook responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }));
    const provider = new DiscordNotificationProvider(
      'https://discord.com/api/webhooks/x/y',
      silentLogger,
    );
    await expect(provider.notifyGoodDeals([buildScored()])).rejects.toThrow(/400/);
  });
});
