import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { loadEnv } from '../config/env.js';
import type { User, UserRole } from '../domain/entities/User.js';
import { openDatabaseFromEnv } from '../infrastructure/persistence/libsql/Database.js';
import { LibsqlUserRepository } from '../infrastructure/persistence/libsql/LibsqlUserRepository.js';

const BCRYPT_ROUNDS = 10;

export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().min(1).max(80).optional(),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/** The admin email is the one address that gets the `admin` role. */
function roleForEmail(email: string): UserRole {
  const adminEmail = loadEnv().ADMIN_EMAIL?.trim().toLowerCase();
  return adminEmail && email.trim().toLowerCase() === adminEmail ? 'admin' : 'user';
}

/**
 * Registers an email+password account. Throws if the email is already taken
 * or the input is invalid. Password is bcrypt-hashed; the plaintext never
 * touches the database.
 */
export async function registerUser(input: Credentials): Promise<User> {
  const { email, password, name } = credentialsSchema.parse(input);
  const db = await openDatabaseFromEnv();
  try {
    const users = new LibsqlUserRepository(db);
    if (await users.findByEmail(email)) {
      throw new Error('An account with this email already exists.');
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    return await users.create({ email, name, passwordHash, role: roleForEmail(email) });
  } finally {
    db.close();
  }
}

/** Verifies email+password for the Credentials provider. Returns the user or null. */
export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const db = await openDatabaseFromEnv();
  try {
    const user = await new LibsqlUserRepository(db).findByEmail(email);
    if (!user?.passwordHash) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  } finally {
    db.close();
  }
}

/**
 * Finds or creates the local user record for an OAuth sign-in, applying the
 * admin role when the email matches ADMIN_EMAIL. Returns the user's id/role.
 */
export async function upsertOAuthUser(
  email: string,
  name: string | undefined,
): Promise<{ id: string; role: UserRole }> {
  const db = await openDatabaseFromEnv();
  try {
    const users = new LibsqlUserRepository(db);
    const existing = await users.findByEmail(email);
    if (existing) return { id: existing.id, role: existing.role };
    const created = await users.create({
      email,
      name,
      passwordHash: undefined,
      role: roleForEmail(email),
    });
    return { id: created.id, role: created.role };
  } finally {
    db.close();
  }
}

export const nameSchema = z.string().trim().min(1, 'Name is required').max(80);
export const newEmailSchema = z.string().email();
export const newPasswordSchema = z.string().min(8, 'Password must be at least 8 characters');

/** Updates the display name. */
export async function updateName(userId: string, name: string): Promise<void> {
  const parsed = nameSchema.parse(name);
  const db = await openDatabaseFromEnv();
  try {
    await new LibsqlUserRepository(db).setName(userId, parsed);
  } finally {
    db.close();
  }
}

/**
 * Changes the login email for a password account. Requires the current
 * password, and rejects an email already used by someone else. OAuth-only
 * accounts (no password) can't change their email here.
 */
export async function changeEmail(
  userId: string,
  currentPassword: string,
  newEmail: string,
): Promise<void> {
  const email = newEmailSchema.parse(newEmail);
  const db = await openDatabaseFromEnv();
  try {
    const users = new LibsqlUserRepository(db);
    const user = await users.findById(userId);
    if (!user?.passwordHash) throw new Error('This account has no password set.');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new Error('Current password is incorrect.');
    }
    const existing = await users.findByEmail(email);
    if (existing && existing.id !== userId) {
      throw new Error('That email is already in use.');
    }
    await users.setEmail(userId, email);
  } finally {
    db.close();
  }
}

/** Changes the password for a password account, verifying the current one first. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const next = newPasswordSchema.parse(newPassword);
  const db = await openDatabaseFromEnv();
  try {
    const users = new LibsqlUserRepository(db);
    const user = await users.findById(userId);
    if (!user?.passwordHash) throw new Error('This account has no password set.');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new Error('Current password is incorrect.');
    }
    await users.setPasswordHash(userId, await bcrypt.hash(next, BCRYPT_ROUNDS));
  } finally {
    db.close();
  }
}

/** Loads a user's public profile fields for the settings UI. */
export async function getAccount(
  userId: string,
): Promise<{ email: string; name: string | undefined; hasPassword: boolean } | null> {
  const db = await openDatabaseFromEnv();
  try {
    const user = await new LibsqlUserRepository(db).findById(userId);
    if (!user) return null;
    return { email: user.email, name: user.name, hasPassword: Boolean(user.passwordHash) };
  } finally {
    db.close();
  }
}
