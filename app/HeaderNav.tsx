'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, MenuIcon } from './icons.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';

/** Must match the `@media (max-width: 768px)` hamburger breakpoint in globals.css. */
const MOBILE_NAV_MAX = 768;

function isVisible(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter(isVisible);
}

/**
 * Responsive primary nav as a disclosure (WAI-ARIA APG), not an ARIA menu:
 * the panel is a list of links inside `<nav>`. On viewports ≤768px a button
 * toggles it. Escape restores focus to the button; a backdrop tap, a link,
 * or growing to desktop also close it.
 */
export function HeaderNav({ children, locale }: { children: ReactNode; locale: Locale }) {
  const t = useT(locale);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const navId = useId();

  useEffect(() => setMounted(true), []);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('nav-open');
    const header = wrapRef.current?.closest('.site-header');
    if (header instanceof HTMLElement) {
      document.documentElement.style.setProperty(
        '--site-header-height',
        `${header.getBoundingClientRect().height}px`,
      );
    }
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || navRef.current?.contains(target)) return;
      close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [
        ...(wrapRef.current ? focusables(wrapRef.current) : []),
        ...(navRef.current ? focusables(navRef.current) : []),
      ];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('nav-open');
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MOBILE_NAV_MAX + 1}px)`);
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const nav = (
    <nav
      ref={navRef}
      id={navId}
      className="site-nav"
      aria-label={t.common.mainNav}
      data-open={open || undefined}
      onClick={(e) => {
        const el = e.target as HTMLElement;
        if (el.closest('a') || el.closest('.nav-signout')) close(false);
      }}
    >
      <ul className="site-nav-list">{children}</ul>
    </nav>
  );

  return (
    <div className="header-nav" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="nav-burger"
        aria-label={t.common.menu}
        aria-expanded={open}
        aria-controls={navId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
      </button>
      {mounted && open
        ? createPortal(
            <>
              <div className="nav-backdrop" aria-hidden="true" onClick={() => close(false)} />
              {nav}
            </>,
            document.body,
          )
        : nav}
    </div>
  );
}
