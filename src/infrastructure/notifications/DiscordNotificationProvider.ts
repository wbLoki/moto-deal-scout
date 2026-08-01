import type { Logger } from 'pino';
import type { DailyReport } from '../../domain/entities/DailyReport.js';
import type { ScoredListing } from '../../domain/entities/ScoredListing.js';
import type { NotificationProvider } from '../../domain/interfaces/NotificationProvider.js';

const EMBEDS_PER_MESSAGE = 10;
const EMBED_COLOR_GOOD_DEAL = 0x2ecc71;
const EMBED_COLOR_REPORT = 0x3498db;

interface DiscordEmbed {
  readonly title: string;
  readonly url?: string;
  readonly color: number;
  readonly description: string;
  readonly image?: { readonly url: string };
  readonly fields: ReadonlyArray<{ name: string; value: string; inline?: boolean }>;
}

function toEmbed(scored: ScoredListing): DiscordEmbed {
  const { listing, score, match } = scored;
  return {
    title: `${match.criteria.brand} ${match.criteria.model} — ${listing.priceMAD} MAD`,
    url: listing.url,
    color: EMBED_COLOR_GOOD_DEAL,
    description: `Score: **${score.total}/100**\n${score.reasons.join('\n')}`,
    ...(listing.imageUrl ? { image: { url: listing.imageUrl } } : {}),
    fields: [
      { name: 'Year', value: String(listing.year ?? 'n/a'), inline: true },
      {
        name: 'Mileage',
        value: listing.mileageKm !== undefined ? `${listing.mileageKm} km` : 'n/a',
        inline: true,
      },
      { name: 'City', value: listing.city, inline: true },
      { name: 'Source', value: listing.sourceId, inline: true },
    ],
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Posts to a Discord webhook. Set `DISCORD_WEBHOOK_URL` in `.env` to
 * activate it — see https://support.discord.com/hc/en-us/articles/228383668
 * for how to create one on a channel you own. Until it's set, this
 * provider logs and no-ops instead of throwing, so it's safe to leave
 * wired up in the notifier list.
 */
export class DiscordNotificationProvider implements NotificationProvider {
  readonly id = 'discord';

  constructor(
    private readonly webhookUrl: string | undefined,
    private readonly logger: Logger,
  ) {}

  async notifyGoodDeals(deals: readonly ScoredListing[]): Promise<void> {
    if (!this.isConfigured()) return;
    for (const batch of chunk(deals, EMBEDS_PER_MESSAGE)) {
      await this.post({
        content: `🏍️ ${deals.length} good deal(s) found`,
        embeds: batch.map(toEmbed),
      });
    }
  }

  async sendDailyReport(report: DailyReport): Promise<void> {
    if (!this.isConfigured()) return;
    const lines = report.sources.map(
      (s) =>
        `- ${s.sourceId}: ${s.listingsFound} found, ${s.newListings} new${s.error ? ` (error: ${s.error})` : ''}`,
    );
    await this.post({
      embeds: [
        {
          title: 'Moto Deal Scout — daily report',
          color: EMBED_COLOR_REPORT,
          description: [
            `Scanned ${report.totalListingsScanned} listings, ${report.newListingsSeen} new, ${report.goodDeals.length} good deal(s).`,
            ...lines,
          ].join('\n'),
          fields: [],
        },
      ],
    });
  }

  private isConfigured(): boolean {
    if (!this.webhookUrl) {
      this.logger.debug('DISCORD_WEBHOOK_URL not set; skipping Discord notification');
      return false;
    }
    return true;
  }

  private async post(body: { content?: string; embeds: DiscordEmbed[] }): Promise<void> {
    if (!this.webhookUrl) return;
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Discord webhook returned ${response.status}: ${text}`);
    }
  }
}
