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

// Anyone can browse the deal feed and marketing pages without an account. Only
// these prefixes require a logged-in user; everything else (incl. `/`) is
// public. This is the inverse of the old deny-by-default gate — it lets
// anonymous visitors use the app while keeping member-only areas protected.
const PROTECTED_PREFIXES = [
  '/onboarding',
  '/profile',
  '/requests',
  '/cars/requests',
  '/notifications',
  '/saved',
  '/admin',
];

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
    /** Route protection for middleware: public by default, login required only for member/admin areas. */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isProtected = PROTECTED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      );
      if (!isProtected) return true;
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
