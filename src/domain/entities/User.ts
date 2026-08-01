export type UserRole = 'user' | 'admin';

/** An account. `passwordHash` is undefined for OAuth-only users. */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string | undefined;
  readonly passwordHash: string | undefined;
  readonly role: UserRole;
  readonly createdAt: Date;
}

/** Fields needed to create an account; the id and timestamps are assigned by the store. */
export interface NewUser {
  readonly email: string;
  readonly name: string | undefined;
  readonly passwordHash: string | undefined;
  readonly role: UserRole;
}
