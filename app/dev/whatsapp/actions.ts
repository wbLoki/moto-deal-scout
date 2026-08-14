'use server';

import { auth } from '../../../auth.js';
import { loadEnv } from '../../../src/config/env.js';
import { parseMarketplaceId } from '../../../src/domain/entities/Listing.js';
import type { StoredNotification } from '../../../src/domain/entities/Notification.js';
import { WhatsAppAlertProvider } from '../../../src/infrastructure/notifications/WhatsAppAlertProvider.js';

const E164 = /^\+[1-9]\d{7,14}$/;

export interface WhatsAppTestState {
  readonly ok?: boolean;
  readonly message?: string;
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

export async function sendWhatsAppTestAction(
  _prev: WhatsAppTestState,
  formData: FormData,
): Promise<WhatsAppTestState> {
  if (process.env.NODE_ENV === 'production') {
    return { message: 'This page is disabled in production.' };
  }
  const session = await auth();
  if (!session?.user?.id) return { message: 'Sign in first.' };

  const phone = str(formData, 'phone').replace(/\s+/g, '').trim();
  if (!E164.test(phone)) {
    return { message: 'Phone must be E.164, e.g. +212612345678.' };
  }

  const env = loadEnv();
  const provider = WhatsAppAlertProvider.fromEnv(env);
  if (!provider) {
    return {
      message:
        'WhatsApp is not configured. Set WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_TEMPLATE_NAME in .env.',
    };
  }

  const title = str(formData, 'title').trim() || 'Yamaha MT-07 — test';
  const priceRaw = str(formData, 'price').trim();
  const priceMAD = priceRaw ? Number(priceRaw) : 68000;
  const sourceId = parseMarketplaceId(str(formData, 'sourceId').trim());
  const externalId = str(formData, 'externalId').trim();
  if (!sourceId || !externalId) {
    return { message: 'Source id and external id are required (open a listing in the app to copy them).' };
  }

  const notification: StoredNotification = {
    id: 'dev-test',
    userId: session.user.id,
    type: 'new_deal',
    sourceId,
    externalId,
    modelId: 'yamaha-mt07',
    priceMAD: Number.isFinite(priceMAD) ? priceMAD : 68000,
    oldPriceMAD: null,
    url: `https://motosnipe.com/l/${sourceId}/${encodeURIComponent(externalId)}`,
    imageUrl: null,
    title,
    createdAt: new Date().toISOString(),
    readAt: null,
    emailedAt: null,
    whatsappedAt: null,
  };

  try {
    await provider.sendDigests([{ phone, notifications: [notification] }]);
    return { ok: true, message: `Sent template “${env.WHATSAPP_TEMPLATE_NAME}” to ${phone}.` };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { message: detail };
  }
}
