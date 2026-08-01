import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlUserRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserRepository.js';

describe('LibsqlUserRepository', () => {
  let db: Client;
  let repo: LibsqlUserRepository;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    repo = new LibsqlUserRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a user and finds it by id', async () => {
    const created = await repo.create({
      email: 'a@example.com',
      name: 'A',
      passwordHash: 'hash',
      role: 'user',
    });
    await expect(repo.findById(created.id)).resolves.toMatchObject({ email: 'a@example.com' });
  });

  it('matches email case-insensitively and stores it lowercased', async () => {
    await repo.create({
      email: 'Mixed@Example.COM',
      name: undefined,
      passwordHash: 'h',
      role: 'user',
    });
    const found = await repo.findByEmail('mixed@example.com');
    expect(found?.email).toBe('mixed@example.com');
  });

  it('preserves the admin role', async () => {
    const admin = await repo.create({
      email: 'admin@example.com',
      name: undefined,
      passwordHash: 'h',
      role: 'admin',
    });
    expect(admin.role).toBe('admin');
  });

  it('returns null for an unknown email', async () => {
    await expect(repo.findByEmail('nobody@example.com')).resolves.toBeNull();
  });

  it('rejects a duplicate email (unique constraint)', async () => {
    await repo.create({
      email: 'dup@example.com',
      name: undefined,
      passwordHash: 'h',
      role: 'user',
    });
    await expect(
      repo.create({ email: 'dup@example.com', name: undefined, passwordHash: 'h', role: 'user' }),
    ).rejects.toThrow();
  });
});
