'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CloseIcon } from './icons.js';

/**
 * Prompt shown when an anonymous visitor clicks a members-only control (follow,
 * save, …). `feature` is a short verb phrase like "follow models"; null hides
 * the modal. Closes on backdrop click or Escape.
 */
export function SignInModal({ feature, onClose }: { feature: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!feature) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [feature, onClose]);

  if (!feature) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Sign in to ${feature}`}
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        <h2 className="modal-title">Sign in to {feature}</h2>
        <p className="modal-text">
          Create a free account to {feature}, and get alerted the moment a matching deal appears.
        </p>
        <div className="modal-actions">
          <Link href="/signup" className="btn btn-primary">
            Create account
          </Link>
          <Link href="/login" className="btn">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
