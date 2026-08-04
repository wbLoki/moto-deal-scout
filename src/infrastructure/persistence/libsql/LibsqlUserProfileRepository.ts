import type { Client, InStatement } from '@libsql/client';
import type { UserProfileRepository } from '../../../domain/interfaces/UserProfileRepository.js';

export class LibsqlUserProfileRepository implements UserProfileRepository {
  constructor(private readonly client: Client) {}

  async getWatchedModelIds(userId: string): Promise<string[]> {
    const result = await this.client.execute({
      sql: 'SELECT model_id FROM user_watched_models WHERE user_id = ? ORDER BY model_id',
      args: [userId],
    });
    return (result.rows as unknown as { model_id: string }[]).map((r) => r.model_id);
  }

  async setWatchedModelIds(userId: string, modelIds: readonly string[]): Promise<void> {
    // Replace the whole set atomically: clear, then insert the new ids.
    const statements: InStatement[] = [
      { sql: 'DELETE FROM user_watched_models WHERE user_id = ?', args: [userId] },
      ...[...new Set(modelIds)].map((modelId) => ({
        sql: 'INSERT INTO user_watched_models (user_id, model_id) VALUES (?, ?)',
        args: [userId, modelId],
      })),
    ];
    await this.client.batch(statements, 'write');
  }

  async addWatchedModel(userId: string, modelId: string): Promise<void> {
    await this.client.execute({
      sql: 'INSERT INTO user_watched_models (user_id, model_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
      args: [userId, modelId],
    });
  }

  async removeWatchedModel(userId: string, modelId: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM user_watched_models WHERE user_id = ? AND model_id = ?',
      args: [userId, modelId],
    });
  }

  async isOnboarded(userId: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: 'SELECT 1 FROM user_onboarding WHERE user_id = ? LIMIT 1',
      args: [userId],
    });
    return result.rows.length > 0;
  }

  async markOnboarded(userId: string): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO user_onboarding (user_id) VALUES (?)
            ON CONFLICT (user_id) DO NOTHING`,
      args: [userId],
    });
  }
}
