'use client';

import { useEffect, useState } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from './icons.js';

type Theme = 'system' | 'light' | 'dark';
const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * Applies a theme choice: "system" removes the override so the CSS
 * prefers-color-scheme media query takes over; "light"/"dark" force it via a
 * `data-theme` attribute on <html>. Persisted in localStorage and re-applied
 * before paint by the inline script in the root layout (no flash).
 */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* storage may be unavailable (private mode) — the choice just won't persist */
  }
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    /* ignore */
  }
  return 'system';
}

/** Header button cycling System → Light → Dark. Default is System. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(readTheme());
  }, []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? 'system';
    setTheme(next);
    applyTheme(next);
  };

  // Render a stable icon until mounted so server and first client render match.
  const Icon = !mounted
    ? MonitorIcon
    : theme === 'light'
      ? SunIcon
      : theme === 'dark'
        ? MoonIcon
        : MonitorIcon;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      title={`Theme: ${LABEL[theme]} (click to change)`}
      aria-label={`Theme: ${LABEL[theme]}. Click to change.`}
    >
      <Icon size={18} />
    </button>
  );
}
