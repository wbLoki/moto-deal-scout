import { randomUUID } from 'node:crypto';
import type { Client, InStatement } from '@libsql/client';
import type { NewNotification, StoredNotification } from '../../../domain/entities/Notification.js';
import type { NotificationRepository } from '../../../domain/interfaces/NotificationRepository.js';

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  source_id: string;
  external_id: string;
  model_id: string | null;
  price_mad: number | null;
  old_price_mad: number | null;
  url: string;
  image_url: string | null;
  title: string;
  created_at: string;
  read_at: string | null;
  emailed_at: string | null;
  whatsapped_at: string | null;
}

const SELECT_COLUMNS =
  'id, user_id, type, source_id, external_id, model_id, price_mad, old_price_mad, url, image_url, title, created_at, read_at, emailed_at, whatsapped_at';

function mapRow(row: NotificationRow): StoredNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type === 'price_drop' ? 'price_drop' : 'new_deal',
    sourceId: row.source_id,
    externalId: row.external_id,
    modelId: row.model_id,
    priceMAD: row.price_mad,
    oldPriceMAD: row.old_price_mad,
    url: row.url,
    imageUrl: row.image_url,
    title: row.title,
    createdAt: row.created_at,
    readAt: row.read_at,
    emailedAt: row.emailed_at,
    whatsappedAt: row.whatsapped_at,
  };
}

export class LibsqlNotificationRepository implements NotificationRepository {
  constructor(private readonly client: Client) {}

  async insertMany(rows: readonly NewNotification[]): Promise<void> {
    if (rows.length === 0) return;
    const statements: InStatement[] = rows.map((n) => ({
      sql: `INSERT INTO notifications
              (id, user_id, type, source_id, external_id, model_id, price_mad, old_price_mad, url, image_url, title)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (user_id, type, source_id, external_id) DO NOTHING`,
      args: [
        randomUUID(),
        n.userId,
        n.type,
        n.sourceId,
        n.externalId,
        n.modelId,
        n.priceMAD,
        n.oldPriceMAD,
        n.url,
        n.imageUrl,
        n.title,
      ],
    }));
    await this.client.batch(statements, 'write');
  }

  async listForUser(userId: string, limit = 50): Promise<StoredNotification[]> {
    const result = await this.client.execute({
      sql: `SELECT ${SELECT_COLUMNS} FROM notifications
            WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      args: [userId, limit],
    });
    return (result.rows as unknown as NotificationRow[]).map(mapRow);
  }

  async countUnread(userId: string): Promise<number> {
    const result = await this.client.execute({
      sql: 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
      args: [userId],
    });
    return Number((result.rows[0] as unknown as { n: number } | undefined)?.n ?? 0);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.client.execute({
      sql: `UPDATE notifications
            SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE user_id = ? AND read_at IS NULL`,
      args: [userId],
    });
  }

  async listUnemailedGroupedByUser(): Promise<Map<string, StoredNotification[]>> {
    const result = await this.client.execute(
      `SELECT ${SELECT_COLUMNS} FROM notifications
       WHERE emailed_at IS NULL ORDER BY user_id, created_at DESC`,
    );
    const grouped = new Map<string, StoredNotification[]>();
    for (const row of result.rows as unknown as NotificationRow[]) {
      const n = mapRow(row);
      const list = grouped.get(n.userId) ?? [];
      list.push(n);
      grouped.set(n.userId, list);
    }
    return grouped;
  }

  async markEmailed(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.client.execute({
      sql: `UPDATE notifications
            SET emailed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id IN (${placeholders})`,
      args: [...ids],
    });
  }

  async listUnwhatsappedGroupedByUser(): Promise<Map<string, StoredNotification[]>> {
    const result = await this.client.execute(
      `SELECT ${SELECT_COLUMNS} FROM notifications
       WHERE whatsapped_at IS NULL ORDER BY user_id, created_at DESC`,
    );
    const grouped = new Map<string, StoredNotification[]>();
    for (const row of result.rows as unknown as NotificationRow[]) {
      const n = mapRow(row);
      const list = grouped.get(n.userId) ?? [];
      list.push(n);
      grouped.set(n.userId, list);
    }
    return grouped;
  }

  async markWhatsapped(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.client.execute({
      sql: `UPDATE notifications
            SET whatsapped_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id IN (${placeholders})`,
      args: [...ids],
    });
  }
}
