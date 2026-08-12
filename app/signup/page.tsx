import Link from 'next/link';
import { SignupForm } from './SignupForm.js';
import { OAuthButtons } from '../OAuthButtons.js';
import { BrandLogo } from '../BrandLogo.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <main className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">
          <BrandLogo variant="wordmark" />
        </h1>
        <p className="auth-subtitle">Create an account to track deals in your budget.</p>
        <SignupForm />
        <OAuthButtons />
        <p className="auth-alt">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
