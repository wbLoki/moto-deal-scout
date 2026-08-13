import type { ReactNode } from 'react';
import { getLocale } from './i18n/getLocale.js';
import { LocaleSwitcher } from './i18n/LocaleSwitcher.js';

/** Auth pages have no site header, so the language toggle sits above the card. */
export async function AuthShell({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <main className="auth-container">
      <div className="auth-locale">
        <LocaleSwitcher locale={locale} />
      </div>
      {children}
    </main>
  );
}
