import Link from 'next/link';
import { LoginForm } from './LoginForm.js';
import { OAuthButtons } from '../OAuthButtons.js';
import { MotoIcon } from '../icons.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">
          <MotoIcon size={24} />
          Moto Deal Scout
        </h1>
        <p className="auth-subtitle">Sign in to see deals matched to your budget.</p>
        <LoginForm />
        <OAuthButtons />
        <p className="auth-alt">
          No account? <Link href="/signup">Create one</Link>
        </p>
      </div>
    </main>
  );
}
