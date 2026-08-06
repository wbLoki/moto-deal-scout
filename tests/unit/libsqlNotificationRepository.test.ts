import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NewNotification } from '../../src/domain/entities/Notification.js';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlNotificationRepository } from '../../src/infrastructure/persistence/libsql/LibsqlNotificationRepository.js';

function note(over: Partial<NewNotification> = {}): NewNotification {
  return {
    userId: 'u1',
    type: 'new_deal',
    sourceId: 'avito',
    externalId: '1',
    modelId: 'yamaha-mt07',
    priceMAD: 70000,
    oldPriceMAD: null,
    url: 'https://example.com/1',
    imageUrl: null,
    title: 'Yamaha MT-07 — 70 000 MAD',
    ...over,
  };
}

describe('LibsqlNotificationRepository', () => {
  let db: Client;
  let repo: LibsqlNotificationRepository;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    repo = new LibsqlNotificationRepository(db);
    // notifications.user_id has a FK to users, which libsql enforces.
    await db.batch(
      [
        { sql: 'INSERT INTO users (id, email) VALUES (?, ?)', args: ['u1', 'u1@example.com'] },
        { sql: 'INSERT INTO users (id, email) VALUES (?, ?)', args: ['u2', 'u2@example.com'] },
      ],
      'write',
    );
  });

  afterEach(() => {
    db.close();
  });

  it('dedups inserts by (user, type, source, external)', async () => {
    await repo.insertMany([note(), note()]);
    expect(await repo.listForUser('u1')).toHaveLength(1);
  });

  it('does not dedup across a different type for the same listing', async () => {
    await repo.insertMany([
      note({ type: 'new_deal' }),
      note({ type: 'price_drop', oldPriceMAD: 80000 }),
    ]);
    expect(await repo.listForUser('u1')).toHaveLength(2);
  });

  it('counts unread then clears on markAllRead', async () => {
    await repo.insertMany([note({ externalId: '1' }), note({ externalId: '2' })]);
    expect(await repo.countUnread('u1')).toBe(2);
    await repo.markAllRead('u1');
    expect(await repo.countUnread('u1')).toBe(0);
  });

  it('groups unemailed by user and clears them on markEmailed', async () => {
    await repo.insertMany([
      note({ userId: 'u1', externalId: '1' }),
      note({ userId: 'u2', externalId: '1' }),
    ]);
    const grouped = await repo.listUnemailedGroupedByUser();
    expect([...grouped.keys()].sort()).toEqual(['u1', 'u2']);

    const ids = [...grouped.values()].flat().map((n) => n.id);
    await repo.markEmailed(ids);
    expect((await repo.listUnemailedGroupedByUser()).size).toBe(0);
  });
});
