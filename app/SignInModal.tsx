'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CloseIcon } from './icons.js';
import { useT } from './i18n/I18nProvider.js';
import type { SignInFeature } from './i18n/en.js';
import type { Locale } from './i18n/locales.js';

export type { SignInFeature };

/**
 * Prompt shown when an anonymous visitor clicks a members-only control (follow,
 * save, …). `feature` is a dictionary key; null hides the modal. Closes on
 * backdrop click or Escape.
 */
export function SignInModal({
  feature,
  onClose,
  locale,
}: {
  feature: SignInFeature | null;
  onClose: () => void;
  locale: Locale;
}) {
  const t = useT(locale);
  useEffect(() => {
    if (!feature) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [feature, onClose]);

  if (!feature) return null;

  const copy = t.signInModal[feature];

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label={t.common.close} onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        <h2 className="modal-title">{copy.title}</h2>
        <p className="modal-text">{copy.body}</p>
        <div className="modal-actions">
          <Link href="/signup" className="btn btn-primary">
            {t.nav.createAccount}
          </Link>
          <Link href="/login" className="btn">
            {t.nav.signIn}
          </Link>
        </div>
      </div>
    </div>
  );
}
