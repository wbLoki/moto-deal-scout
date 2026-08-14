import { describe, expect, it, vi } from 'vitest';
import { WhatsAppAlertProvider } from '../../src/infrastructure/notifications/WhatsAppAlertProvider.js';
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
    whatsappedAt: null,
    ...over,
  };
}

function makeEnv(over: Partial<Env> = {}): Env {
  return {
    WHATSAPP_TOKEN: 'tok',
    WHATSAPP_PHONE_NUMBER_ID: '123',
    WHATSAPP_TEMPLATE_NAME: 'deal_alert',
    WHATSAPP_TEMPLATE_LANG: 'fr',
    ...over,
  } as Env;
}

describe('WhatsAppAlertProvider', () => {
  it('is only constructed when token, phone id and template name are set', () => {
    expect(WhatsAppAlertProvider.fromEnv({} as Env)).toBeUndefined();
    expect(WhatsAppAlertProvider.fromEnv(makeEnv())).toBeInstanceOf(WhatsAppAlertProvider);
  });

  it('posts a template message to Graph API', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    const provider = WhatsAppAlertProvider.fromEnv(makeEnv(), fetchImpl);
    await provider!.sendDigests([{ phone: '+212612345678', notifications: [note()] }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const url = call![0];
    const bodyRaw = call![1]?.body;
    expect(url).toContain('/123/messages');
    const body = JSON.parse(typeof bodyRaw === 'string' ? bodyRaw : '') as {
      to: string;
      template: { name: string };
    };
    expect(body.to).toBe('212612345678');
    expect(body.template.name).toBe('deal_alert');
  });
});
