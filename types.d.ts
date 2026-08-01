import type { DefaultSession } from 'next-auth';
import type { UserRole } from './src/domain/entities/User.js';

// Adds our app-specific id/role to the Auth.js session, user, and JWT types.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession['user'];
  }
  interface User {
    role?: UserRole;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: UserRole;
  }
}
