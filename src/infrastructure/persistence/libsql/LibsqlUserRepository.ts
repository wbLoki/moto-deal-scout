import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import type { NewUser, User, UserRole } from '../../../domain/entities/User.js';
import type { UserRepository } from '../../../domain/interfaces/UserRepository.js';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  role: string;
  created_at: string;
  phone: string | null;
  whatsapp_opt_in: number | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    passwordHash: row.password_hash ?? undefined,
    role: row.role as UserRole,
    createdAt: new Date(row.created_at),
    phone: row.phone ?? undefined,
    whatsappOptIn: Number(row.whatsapp_opt_in) === 1,
  };
}

export class LibsqlUserRepository implements UserRepository {
  constructor(private readonly client: Client) {}

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM users WHERE email = ? LIMIT 1',
      args: [normalizeEmail(email)],
    });
    const row = result.rows[0] as unknown as UserRow | undefined;
    return row ? mapRow(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM users WHERE id = ? LIMIT 1',
      args: [id],
    });
    const row = result.rows[0] as unknown as UserRow | undefined;
    return row ? mapRow(row) : null;
  }

  async create(user: NewUser): Promise<User> {
    const id = randomUUID();
    await this.client.execute({
      sql: `INSERT INTO users (id, email, name, password_hash, role)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        id,
        normalizeEmail(user.email),
        user.name ?? null,
        user.passwordHash ?? null,
        user.role,
      ],
    });
    const created = await this.findById(id);
    if (!created) throw new Error('User creation failed');
    return created;
  }

  async setName(userId: string, name: string | undefined): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE users SET name = ? WHERE id = ?',
      args: [name ?? null, userId],
    });
  }

  async setEmail(userId: string, email: string): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE users SET email = ? WHERE id = ?',
      args: [normalizeEmail(email), userId],
    });
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE users SET password_hash = ? WHERE id = ?',
      args: [passwordHash, userId],
    });
  }

  async setWhatsAppPrefs(userId: string, phone: string | undefined, optIn: boolean): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE users SET phone = ?, whatsapp_opt_in = ? WHERE id = ?',
      args: [phone ?? null, optIn ? 1 : 0, userId],
    });
  }
}
