import type { Env } from '../../config/env.js';
import type { NotificationType, StoredNotification } from '../../domain/entities/Notification.js';

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });

export interface DigestItem {
  readonly email: string;
  readonly notifications: readonly StoredNotification[];
}

type FetchLike = typeof fetch;

/**
 * Emails watchlist alert digests via the Resend REST API (no SDK dependency —
 * just a POST, like the Discord provider). One email per user per run,
 * batched in a single Resend call. Constructed only when RESEND_API_KEY is
 * set; callers skip email entirely otherwise, so in-app alerts stand alone.
 */
export class EmailAlertProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /** Returns a provider only when an API key is configured, else undefined. */
  static fromEnv(env: Env, fetchImpl: FetchLike = fetch): EmailAlertProvider | undefined {
    if (!env.RESEND_API_KEY) return undefined;
    return new EmailAlertProvider(
      env.RESEND_API_KEY,
      env.ALERT_FROM_EMAIL,
      env.APP_BASE_URL,
      fetchImpl,
    );
  }

  async sendDigests(items: readonly DigestItem[]): Promise<void> {
    const batch = items
      .filter((i) => i.notifications.length > 0)
      .map((i) => ({
        from: this.fromAddress,
        to: i.email,
        subject: subjectFor(i.notifications),
        html: this.renderHtml(i.notifications),
      }));
    if (batch.length === 0) return;

    const response = await this.fetchImpl(RESEND_BATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Resend returned ${response.status}: ${text}`);
    }
  }

  private renderHtml(notifications: readonly StoredNotification[]): string {
    const rows = notifications.map((n) => this.renderRow(n)).join('');
    const notificationsUrl = `${this.baseUrl}/notifications`;
    return `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h2 style="font-size:18px;margin:0 0 16px">Moto Deal Scout alerts</h2>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <p style="font-size:13px;color:#666;margin:20px 0 0">
          <a href="${notificationsUrl}" style="color:#2563eb">See all your alerts</a>
          · Manage the models you follow in your profile.
        </p>
      </div>`;
  }

  private renderRow(n: StoredNotification): string {
    const price = n.priceMAD !== null ? `${madFmt.format(n.priceMAD)} MAD` : '';
    const sub =
      n.type === 'price_drop'
        ? `Price drop${n.oldPriceMAD !== null ? ` from ${madFmt.format(n.oldPriceMAD)} MAD` : ''}`
        : 'New deal for a model you follow';
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee">
          <a href="${n.url}" style="color:#111;text-decoration:none;font-weight:600">${escapeHtml(n.title)}</a>
          <div style="font-size:13px;color:#666">${sub}${price ? ` · ${price}` : ''}</div>
        </td>
      </tr>`;
  }
}

function subjectFor(notifications: readonly StoredNotification[]): string {
  const types = new Set<NotificationType>(notifications.map((n) => n.type));
  const count = notifications.length;
  if (types.has('price_drop') && types.has('new_deal')) {
    return `${count} new motorcycle deal${count === 1 ? '' : 's'} & price drop${count === 1 ? '' : 's'}`;
  }
  if (types.has('price_drop')) {
    return `${count} price drop${count === 1 ? '' : 's'} on bikes you follow`;
  }
  return `${count} new motorcycle deal${count === 1 ? '' : 's'} for you`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
