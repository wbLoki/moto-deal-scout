'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDownIcon, LogOutIcon, ShieldIcon, UserIcon } from './icons.js';

type UserMenuProps = {
  email: string;
  isAdmin: boolean;
  /** Server action that signs the user out. */
  signOutAction: () => void | Promise<void>;
};

/**
 * Account dropdown for signed-in users: collapses the email, Profile, Model
 * requests, Admin, and Log out into one trigger so the header stays uncluttered.
 */
export function UserMenu({ email, isAdmin, signOutAction }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const initial = email.trim().charAt(0).toUpperCase() || '?';

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

  return (
    <div className="user-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${email}`}
        title={email}
      >
        <span className="user-avatar" aria-hidden="true">
          {initial}
        </span>
        <ChevronDownIcon size={14} />
      </button>

      {open && (
        <div className="user-menu" role="menu">
          <div className="user-menu-head">
            <span className="user-avatar user-avatar-lg" aria-hidden="true">
              {initial}
            </span>
            <span className="user-menu-email">{email}</span>
          </div>
          <div className="user-menu-sep" />
          <Link
            href="/profile"
            role="menuitem"
            className="user-menu-item"
            onClick={() => setOpen(false)}
          >
            <UserIcon size={16} />
            <span>Profile</span>
          </Link>
          <Link
            href="/requests"
            role="menuitem"
            className="user-menu-item"
            onClick={() => setOpen(false)}
          >
            <span>Model requests</span>
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              className="user-menu-item"
              onClick={() => setOpen(false)}
            >
              <ShieldIcon size={16} />
              <span>Admin</span>
            </Link>
          )}
          <div className="user-menu-sep" />
          <form action={signOutAction}>
            <button type="submit" role="menuitem" className="user-menu-item user-menu-signout">
              <LogOutIcon size={16} />
              <span>Log out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
