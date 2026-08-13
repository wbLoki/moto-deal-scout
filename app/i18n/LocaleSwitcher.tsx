'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from './I18nProvider.js';
import type { Locale } from './locales.js';
import { setLocaleAction } from './setLocaleAction.js';

/** Compact FR | EN control. Writes the locale cookie then refreshes the tree. */
export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const t = useT(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const select = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  };

  return (
    <div className="locale-switch-wrap">
      <span className="locale-switch-text">{t.common.language}</span>
      <div className="locale-switch" role="group" aria-label={t.common.language}>
        <button
          type="button"
          className="locale-switch-btn"
          aria-pressed={locale === 'fr'}
          aria-label={t.locale.switchToFr}
          disabled={pending}
          onClick={() => select('fr')}
        >
          {t.locale.fr}
        </button>
        <button
          type="button"
          className="locale-switch-btn"
          aria-pressed={locale === 'en'}
          aria-label={t.locale.switchToEn}
          disabled={pending}
          onClick={() => select('en')}
        >
          {t.locale.en}
        </button>
      </div>
    </div>
  );
}
