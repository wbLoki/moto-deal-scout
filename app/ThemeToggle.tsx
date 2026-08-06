'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  type IconProps,
} from './icons.js';

type Theme = 'system' | 'light' | 'dark';

const OPTIONS: { value: Theme; label: string; Icon: (p: IconProps) => ReactElement }[] = [
  { value: 'system', label: 'System', Icon: MonitorIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
];

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

/** Header dropdown to choose System / Light / Dark. Default is System. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setTheme(readTheme());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const select = (value: Theme) => {
    setTheme(value);
    applyTheme(value);
    setOpen(false);
  };

  // Stable icon/label until mounted so server and first client render match.
  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[0]!;
  const CurrentIcon = mounted ? current.Icon : MonitorIcon;
  const currentLabel = mounted ? current.label : 'System';

  return (
    <div className="theme-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="theme-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${currentLabel}`}
        title={`Theme: ${currentLabel}`}
      >
        <CurrentIcon size={18} />
        <ChevronDownIcon size={14} />
      </button>

      {open && (
        <div className="theme-menu" role="menu">
          {OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              className="theme-menu-item"
              onClick={() => select(value)}
            >
              <Icon size={16} />
              <span>{label}</span>
              {theme === value && <CheckIcon size={15} className="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
