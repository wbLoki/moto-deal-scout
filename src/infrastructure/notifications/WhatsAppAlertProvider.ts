import type { Env } from '../../config/env.js';
import type { StoredNotification } from '../../domain/entities/Notification.js';
import { listingPageButtonSuffix } from './listingPagePath.js';

const GRAPH_VERSION = 'v21.0';
const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });

export interface WhatsAppDigestItem {
  readonly phone: string;
  readonly notifications: readonly StoredNotification[];
}

type FetchLike = typeof fetch;

/**
 * Sends per-user alert digests via the WhatsApp Cloud API using a pre-approved
 * utility template with named body params `model_vehicle` and `price`, plus a
 * dynamic URL button whose suffix is `/l/{sourceId}/{externalId}`.
 * Business-initiated messages cannot be freeform. Constructed only when token +
 * phone-number id + template name are set.
 */
export class WhatsAppAlertProvider {
  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly templateName: string,
    private readonly templateLang: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  static fromEnv(env: Env, fetchImpl: FetchLike = fetch): WhatsAppAlertProvider | undefined {
    if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_TEMPLATE_NAME) {
      return undefined;
    }
    return new WhatsAppAlertProvider(
      env.WHATSAPP_TOKEN,
      env.WHATSAPP_PHONE_NUMBER_ID,
      env.WHATSAPP_TEMPLATE_NAME,
      env.WHATSAPP_TEMPLATE_LANG,
      fetchImpl,
    );
  }

  async sendDigests(items: readonly WhatsAppDigestItem[]): Promise<void> {
    for (const item of items) {
      if (item.notifications.length === 0) continue;
      await this.sendOne(item);
    }
  }

  private async sendOne(item: WhatsAppDigestItem): Promise<void> {
    const first = item.notifications[0]!;
    const title =
      item.notifications.length === 1
        ? first.title
        : `${item.notifications.length} alertes · ${first.title}`;
    const price = first.priceMAD !== null ? `${madFmt.format(first.priceMAD)} MAD` : '';
    const to = item.phone.replace(/^\+/, '');
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneNumberId}/messages`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: this.templateName,
          language: { code: this.templateLang },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', parameter_name: 'model_vehicle', text: clip(title) },
                { type: 'text', parameter_name: 'price', text: clip(price || '—') },
              ],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [
                {
                  type: 'text',
                  text: clip(listingPageButtonSuffix(first.sourceId, first.externalId), 2000),
                },
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`WhatsApp returned ${response.status}: ${text}`);
    }
  }
}

function clip(s: string, max = 1024): string {
  return s.slice(0, max) || '—';
}
