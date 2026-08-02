import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlUserProfileRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { LibsqlUserRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserRepository.js';

describe('LibsqlUserProfileRepository', () => {
  let db: Client;
  let repo: LibsqlUserProfileRepository;
  let userId: string;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    repo = new LibsqlUserProfileRepository(db);
    userId = (
      await new LibsqlUserRepository(db).create({
        email: 'u@x.com',
        name: undefined,
        passwordHash: 'h',
        role: 'user',
      })
    ).id;
  });

  afterEach(() => {
    db.close();
  });

  it('starts empty and not onboarded', async () => {
    await expect(repo.getWatchedModelIds(userId)).resolves.toEqual([]);
    await expect(repo.isOnboarded(userId)).resolves.toBe(false);
  });

  it('replaces the watched set atomically (dedupes and overwrites)', async () => {
    await repo.setWatchedModelIds(userId, ['a', 'b', 'b']);
    await expect(repo.getWatchedModelIds(userId)).resolves.toEqual(['a', 'b']);
    await repo.setWatchedModelIds(userId, ['c']);
    await expect(repo.getWatchedModelIds(userId)).resolves.toEqual(['c']);
  });

  it('clears the watched set when given an empty list', async () => {
    await repo.setWatchedModelIds(userId, ['a']);
    await repo.setWatchedModelIds(userId, []);
    await expect(repo.getWatchedModelIds(userId)).resolves.toEqual([]);
  });

  it('marks onboarded idempotently', async () => {
    await repo.markOnboarded(userId);
    await repo.markOnboarded(userId);
    await expect(repo.isOnboarded(userId)).resolves.toBe(true);
  });
});
