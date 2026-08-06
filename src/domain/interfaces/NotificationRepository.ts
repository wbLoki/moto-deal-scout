import type { NewNotification, StoredNotification } from '../entities/Notification.js';

/**
 * Persistence for per-user in-app notifications. The same rows drive both the
 * in-app bell (`read_at`) and the email digest (`emailed_at`); a unique index
 * on (user_id, type, source_id, external_id) makes `insertMany` idempotent, so
 * a user is never alerted twice about the same listing+type.
 */
export interface NotificationRepository {
  /** Inserts new notifications, ignoring any that would duplicate an existing alert. */
  insertMany(rows: readonly NewNotification[]): Promise<void>;
  listForUser(userId: string, limit?: number): Promise<StoredNotification[]>;
  countUnread(userId: string): Promise<number>;
  markAllRead(userId: string): Promise<void>;
  /** Un-emailed notifications grouped by user, for building the digest. */
  listUnemailedGroupedByUser(): Promise<Map<string, StoredNotification[]>>;
  markEmailed(ids: readonly string[]): Promise<void>;
}
