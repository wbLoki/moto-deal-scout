import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import type { StoredNotification } from './domain/entities/Notification.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlNotificationRepository } from './infrastructure/persistence/libsql/LibsqlNotificationRepository.js';

/** Web-facing helpers over the notification store; each opens the DB per call. */
export async function listUserNotifications(
  userId: string,
  limit = 50,
): Promise<StoredNotification[]> {
  const db = await openDatabase(resolveDatabaseConfig(loadEnv()));
  try {
    return await new LibsqlNotificationRepository(db).listForUser(userId, limit);
  } finally {
    db.close();
  }
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const db = await openDatabase(resolveDatabaseConfig(loadEnv()));
  try {
    return await new LibsqlNotificationRepository(db).countUnread(userId);
  } finally {
    db.close();
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const db = await openDatabase(resolveDatabaseConfig(loadEnv()));
  try {
    await new LibsqlNotificationRepository(db).markAllRead(userId);
  } finally {
    db.close();
  }
}
