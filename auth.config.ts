import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import type { UserRole } from './src/domain/entities/User.js';

// OAuth providers are added only when both id and secret are present, so the
// app runs on email+password alone until you configure them. This module is
// import-safe on the edge (middleware) — no database or bcrypt here.
const oauthProviders: NextAuthConfig['providers'] = [];
if (process.env['AUTH_GOOGLE_ID'] && process.env['AUTH_GOOGLE_SECRET']) {
  oauthProviders.push(Google);
}
if (process.env['AUTH_GITHUB_ID'] && process.env['AUTH_GITHUB_SECRET']) {
  oauthProviders.push(GitHub);
}

const PUBLIC_PATHS = ['/login', '/signup'];

// Auth.js auto-reads AUTH_SECRET from the environment, but we also wire it in
// explicitly (when present) so both the middleware and server share the same
// value. If this is undefined, AUTH_SECRET is not set in the running
// environment — set it (in Vercel, for every environment) and redeploy.
const secret = process.env['AUTH_SECRET'];

/**
 * Edge-safe base config shared by the middleware and the full server config.
 * The Credentials provider and any database-touching callbacks live in
 * `auth.ts` instead, since middleware runs on the edge runtime.
 */
export const authConfig = {
  ...(secret ? { secret } : {}),
  trustHost: true,
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  providers: oauthProviders,
  callbacks: {
    /** Route protection for middleware: everything requires login except the auth pages/API. */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PATHS.includes(pathname)) return true;
      // These have their own CRON_SECRET / Auth.js guards.
      if (
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/scan') ||
        pathname.startsWith('/api/report')
      ) {
        return true;
      }
      return Boolean(auth?.user);
    },
    /** Maps token fields onto the session (no DB access — safe on the edge). */
    session({ session, token }) {
      const t = token as unknown as { id?: string; role?: UserRole };
      if (session.user) {
        if (t.id) session.user.id = t.id;
        if (t.role) session.user.role = t.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export type { UserRole };
