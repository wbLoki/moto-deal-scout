import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRequestRepository } from '../../src/infrastructure/persistence/libsql/LibsqlModelRequestRepository.js';
import { LibsqlUserRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserRepository.js';

describe('LibsqlModelRequestRepository', () => {
  let db: Client;
  let repo: LibsqlModelRequestRepository;
  let userId: string;
  let adminId: string;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    repo = new LibsqlModelRequestRepository(db);
    const users = new LibsqlUserRepository(db);
    userId = (await users.create({ email: 'u@x.com', name: 'U', passwordHash: 'h', role: 'user' }))
      .id;
    adminId = (
      await users.create({ email: 'admin@x.com', name: 'Ad', passwordHash: 'h', role: 'admin' })
    ).id;
  });

  afterEach(() => {
    db.close();
  });

  it('creates a pending request and lists it for the user', async () => {
    await repo.create({ userId, brand: 'Honda', model: 'CB500X', note: 'nice' });
    const mine = await repo.listByUser(userId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ brand: 'Honda', model: 'CB500X', status: 'pending' });
  });

  it('lists pending requests with the requester email', async () => {
    await repo.create({ userId, brand: 'Yamaha', model: 'Tenere', note: undefined });
    const pending = await repo.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.requesterEmail).toBe('u@x.com');
  });

  it('setStatus records the decision and removes it from pending', async () => {
    const req = await repo.create({ userId, brand: 'KTM', model: '390', note: undefined });
    await repo.setStatus(req.id, 'approved', adminId);
    expect(await repo.listPending()).toHaveLength(0);
    const updated = await repo.findById(req.id);
    expect(updated?.status).toBe('approved');
    expect(updated?.decidedBy).toBe(adminId);
    expect(updated?.decidedAt).toBeInstanceOf(Date);
  });
});
