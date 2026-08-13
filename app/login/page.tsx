import Link from 'next/link';
import { LoginForm } from './LoginForm.js';
import { OAuthButtons } from '../OAuthButtons.js';
import { BrandLogo } from '../BrandLogo.js';
import { AuthShell } from '../AuthShell.js';
import { dictionaryFor, getLocale } from '../i18n/getLocale.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const locale = await getLocale();
  const t = dictionaryFor(locale);
  return (
    <AuthShell>
      <div className="auth-card">
        <h1 className="auth-title">
          <BrandLogo variant="wordmark" />
        </h1>
        <p className="auth-subtitle">{t.auth.loginSubtitle}</p>
        <LoginForm locale={locale} />
        <OAuthButtons />
        <p className="auth-alt">
          {t.auth.noAccount} <Link href="/signup">{t.auth.createOne}</Link>
        </p>
      </div>
    </AuthShell>
  );
}
