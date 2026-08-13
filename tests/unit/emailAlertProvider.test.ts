import { describe, expect, it, vi } from 'vitest';
import { EmailAlertProvider } from '../../src/infrastructure/notifications/EmailAlertProvider.js';
import type { Env } from '../../src/config/env.js';
import type { StoredNotification } from '../../src/domain/entities/Notification.js';

function note(over: Partial<StoredNotification> = {}): StoredNotification {
  return {
    id: 'n1',
    userId: 'u1',
    type: 'new_deal',
    sourceId: 'avito',
    externalId: '1',
    modelId: 'yamaha-mt07',
    priceMAD: 68000,
    oldPriceMAD: null,
    url: 'https://example.com/1',
    imageUrl: null,
    title: 'Yamaha MT-07 — 68 000 MAD',
    createdAt: '2026-08-05T07:00:00.000Z',
    readAt: null,
    emailedAt: null,
    ...over,
  };
}

function makeEnv(over: Partial<Env> = {}): Env {
  return { ALERT_FROM_EMAIL: 'from@x.co', APP_BASE_URL: 'https://x.co', ...over } as Env;
}

function okFetch() {
  return vi.fn((_url: string | URL | Request, _init?: RequestInit): Promise<Response> =>
    Promise.resolve(new Response('{}', { status: 200 })),
  );
}

describe('EmailAlertProvider', () => {
  it('is only constructed from env when an API key is set', () => {
    expect(EmailAlertProvider.fromEnv(makeEnv())).toBeUndefined();
    expect(EmailAlertProvider.fromEnv(makeEnv({ RESEND_API_KEY: 'key' }))).toBeInstanceOf(
      EmailAlertProvider,
    );
  });

  it('POSTs a batched digest to Resend with auth and per-user emails', async () => {
    const fetchMock = okFetch();
    const provider = new EmailAlertProvider('key123', 'from@x.co', 'https://x.co', fetchMock);

    await provider.sendDigests([
      { email: 'u1@x.co', notifications: [note({ userId: 'u1' })] },
      {
        email: 'u2@x.co',
        notifications: [note({ userId: 'u2', type: 'price_drop', oldPriceMAD: 80000 })],
      },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails/batch');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer key123' });
    const body = JSON.parse(init?.body as string) as Array<{ to: string; html: string }>;
    expect(body).toHaveLength(2);
    expect(body[0]?.to).toBe('u1@x.co');
    expect(body[1]?.html).toContain('Baisse de prix');
  });

  it('skips the request entirely when there is nothing to send', async () => {
    const fetchMock = okFetch();
    const provider = new EmailAlertProvider('key', 'from@x.co', 'https://x.co', fetchMock);
    await provider.sendDigests([{ email: 'u@x.co', notifications: [] }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-OK Resend response', async () => {
    const fetchMock = vi.fn(
      (_url: string | URL | Request, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(new Response('nope', { status: 422 })),
    );
    const provider = new EmailAlertProvider('key', 'from@x.co', 'https://x.co', fetchMock);
    await expect(
      provider.sendDigests([{ email: 'u@x.co', notifications: [note()] }]),
    ).rejects.toThrow(/Resend returned 422/);
  });
});
