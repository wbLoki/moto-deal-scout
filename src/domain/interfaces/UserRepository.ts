import type { NewUser, User } from '../entities/User.js';

/** Persistence boundary for accounts. Emails are matched case-insensitively. */
export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Creates a user, assigning an id. Rejects if the email already exists. */
  create(user: NewUser): Promise<User>;

  setName(userId: string, name: string | undefined): Promise<void>;
  /** Updates the login email. Rejects if the email is already taken. */
  setEmail(userId: string, email: string): Promise<void>;
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;
  setWhatsAppPrefs(userId: string, phone: string | undefined, optIn: boolean): Promise<void>;
}
