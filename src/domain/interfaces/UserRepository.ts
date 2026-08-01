import type { NewUser, User } from '../entities/User.js';

/** Persistence boundary for accounts. Emails are matched case-insensitively. */
export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Creates a user, assigning an id. Rejects if the email already exists. */
  create(user: NewUser): Promise<User>;
}
