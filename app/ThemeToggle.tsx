'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from './icons.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';

type StoredTheme = 'system' | 'light' | 'dark';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStored(): StoredTheme {
  try {
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    /* ignore */
  }
  return 'system';
}

function applyTheme(theme: StoredTheme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    if (theme === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', theme);
  } catch {
    /* storage may be unavailable (private mode) — the choice just won't persist */
  }
}

function effectiveDark(stored: StoredTheme): boolean {
  if (stored === 'light') return false;
  if (stored === 'dark') return true;
  return systemPrefersDark();
}

/**
 * Light/dark switch. Default follows the OS (`prefers-color-scheme`); flipping
 * it stores an explicit choice. Flipping back to match the OS returns to
 * following system. The inline script in the root layout reapplies a stored
 * light/dark choice before paint so there's no flash.
 */
export function ThemeToggle({ locale }: { locale: Locale }) {
  const t = useT(locale);
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(effectiveDark(readStored()));
    setMounted(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readStored() === 'system') setDark(mq.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const nextDark = !dark;
    const followSystem = nextDark === systemPrefersDark();
    applyTheme(followSystem ? 'system' : nextDark ? 'dark' : 'light');
    setDark(nextDark);
  };

  return (
    <div className="theme-switch-wrap">
      <span className="theme-switch-text" aria-hidden="true">
        {t.common.theme}
      </span>
      <button
        type="button"
        role="switch"
        className="theme-switch"
        aria-checked={mounted ? dark : undefined}
        aria-label={t.common.darkMode}
        title={dark ? t.common.darkMode : t.common.lightMode}
        onClick={toggle}
      >
        <SunIcon size={16} className="theme-switch-sun" />
        <span className="theme-switch-track" aria-hidden="true">
          <span className="theme-switch-thumb" />
        </span>
        <MoonIcon size={16} className="theme-switch-moon" />
      </button>
    </div>
  );
}
