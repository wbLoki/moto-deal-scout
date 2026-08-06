import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@libsql/client';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from '../../src/infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlUserRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserRepository.js';
import { makeModelCriteria } from '../fixtures/sampleData.js';
import type * as DatabaseModuleNs from '../../src/infrastructure/persistence/libsql/Database.js';

type DatabaseModule = typeof DatabaseModuleNs;

// submitModelRequest opens its own connection from env, so point that at the
// same in-memory database this test set up.
const db: { current: Client | undefined } = { current: undefined };
vi.mock('../../src/infrastructure/persistence/libsql/Database.js', async () => {
  const actual = await vi.importActual<DatabaseModule>(
    '../../src/infrastructure/persistence/libsql/Database.js',
  );
  return {
    ...actual,
    openDatabaseFromEnv: () => Promise.resolve(wrap(db.current!)),
  };
});

/**
 * Hands back the shared client but ignores close(), which the service calls
 * after every request. Methods are bound rather than proxied — the libsql
 * client uses private class fields, which a Proxy receiver breaks.
 */
function wrap(client: Client): Client {
  return {
    execute: client.execute.bind(client),
    batch: client.batch.bind(client),
    executeMultiple: client.executeMultiple.bind(client),
    transaction: client.transaction.bind(client),
    sync: client.sync.bind(client),
    close: () => undefined,
    get closed() {
      return client.closed;
    },
    protocol: client.protocol,
  } as unknown as Client;
}

const { submitModelRequest } = await import('../../src/requestService.js');

describe('submitModelRequest', () => {
  let userId: string;

  beforeEach(async () => {
    db.current = await openDatabase({ url: ':memory:' });
    userId = (
      await new LibsqlUserRepository(db.current).create({
        email: 'u@x.com',
        name: undefined,
        passwordHash: 'h',
        role: 'user',
      })
    ).id;
  });

  afterEach(() => {
    db.current?.close();
  });

  it('files a request for a model that is neither tracked nor in the catalog', async () => {
    const result = await submitModelRequest(userId, { brand: 'Obscure', model: 'XZ-9000' });
    expect(result.status).toBe('created');
  });

  it('declines when the model is already tracked', async () => {
    await new LibsqlModelRepository(db.current!).upsert({
      ...makeModelCriteria({ id: 'yamaha-mt07', brand: 'Yamaha', model: 'MT-07' }),
      enabled: true,
      autoCalibrate: true,
    });

    const result = await submitModelRequest(userId, { brand: 'yamaha', model: 'mt 07' });
    expect(result.status).toBe('duplicate');
    if (result.status === 'duplicate') {
      expect(result.message).toContain('already tracked');
    }
  });

  it('declines when the model is in the catalog and will be discovered', async () => {
    const result = await submitModelRequest(userId, { brand: 'Honda', model: 'CB500X' });
    expect(result.status).toBe('duplicate');
    if (result.status === 'duplicate') {
      expect(result.message).toContain('catalog');
    }
  });
});
