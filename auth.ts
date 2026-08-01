import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config.js';
import type { UserRole } from './src/domain/entities/User.js';
import { upsertOAuthUser, verifyCredentials } from './src/auth/userService.js';

interface TokenFields {
  id?: string | undefined;
  role?: UserRole | undefined;
}
interface SignedInUser {
  id?: string;
  email?: string | null;
  name?: string | null;
  role?: UserRole;
}

/**
 * Full server-side Auth.js instance (Node runtime). Extends the edge-safe
 * base with the Credentials provider and the JWT callback that resolves a
 * user to our own database id + role — both of which touch bcrypt/libsql and
 * so must stay out of the edge middleware config.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const email = typeof raw?.email === 'string' ? raw.email : '';
        const password = typeof raw?.password === 'string' ? raw.password : '';
        if (!email || !password) return null;
        const user = await verifyCredentials(email, password);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name ?? null, role: user.role };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (!user) return token;
      const t = token as unknown as TokenFields;
      const u = user as SignedInUser;
      // Credentials sign-in already carries our id + role.
      if (u.role) {
        t.id = u.id;
        t.role = u.role;
        return token;
      }
      // OAuth sign-in: resolve (or create) the matching local account.
      if (u.email) {
        const resolved = await upsertOAuthUser(u.email, u.name ?? undefined);
        t.id = resolved.id;
        t.role = resolved.role;
      }
      return token;
    },
  },
});
