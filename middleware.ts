import NextAuth from 'next-auth';
import { authConfig } from './auth.config.js';

// Runs the edge-safe `authorized` callback on every request, redirecting
// unauthenticated users to /login. Uses only auth.config (no DB/bcrypt).
export default NextAuth(authConfig).auth;

export const config = {
  // Skip Next internals and static assets; guard everything else.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
