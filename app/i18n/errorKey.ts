import { ZodError } from 'zod';
import { UserFacingError } from '../../src/auth/userService.js';
import type { ErrorKey } from './en.js';

export function errorKeyFromCaught(err: unknown, fallback: ErrorKey = 'generic'): ErrorKey {
  if (
    err instanceof UserFacingError ||
    (err instanceof Error && err.name === 'UserFacingError' && 'code' in err)
  ) {
    return (err as UserFacingError).code;
  }
  if (err instanceof ZodError) {
    const path = err.issues[0]?.path[0];
    if (path === 'email') return 'invalid_email';
    if (path === 'password' || path === 'newPassword') return 'password_too_short';
    if (path === 'name') return 'name_required';
  }
  return fallback;
}
