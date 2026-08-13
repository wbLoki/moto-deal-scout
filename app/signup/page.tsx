import Link from 'next/link';
import { SignupForm } from './SignupForm.js';
import { OAuthButtons } from '../OAuthButtons.js';
import { BrandLogo } from '../BrandLogo.js';
import { AuthShell } from '../AuthShell.js';
import { dictionaryFor, getLocale } from '../i18n/getLocale.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const locale = await getLocale();
  const t = dictionaryFor(locale);
  return (
    <AuthShell>
      <div className="auth-card">
        <h1 className="auth-title">
          <BrandLogo variant="wordmark" />
        </h1>
        <p className="auth-subtitle">{t.auth.signupSubtitle}</p>
        <SignupForm locale={locale} />
        <OAuthButtons />
        <p className="auth-alt">
          {t.auth.haveAccount} <Link href="/login">{t.nav.signIn}</Link>
        </p>
      </div>
    </AuthShell>
  );
}
