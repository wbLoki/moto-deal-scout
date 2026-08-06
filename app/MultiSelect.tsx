'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon } from './icons.js';
import type { FilterOption } from './dealFilters.js';

/**
 * A labelled dropdown that lets the user pick several options via checkboxes.
 * The list expands inline (in flow) rather than as an absolute overlay, so it
 * never gets clipped inside the scrollable filter sidebar.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  allLabel,
}: {
  label: string;
  options: readonly FilterOption[];
  selected: readonly string[];
  onChange: (values: string[]) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  const toggle = (value: string) => {
    const set = new Set(selected);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange([...set]);
  };

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? '1 selected')
        : `${selected.length} selected`;

  return (
    <div className="multiselect" ref={ref}>
      <span className="multiselect-label">{label}</span>
      <button
        type="button"
        className="multiselect-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected.length ? 'multiselect-value on' : 'multiselect-value'}>
          {summary}
        </span>
        <ChevronDownIcon size={14} />
      </button>

      {open && (
        <div className="multiselect-menu" role="listbox" aria-multiselectable="true">
          {options.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={checked}
                className="multiselect-option"
                onClick={() => toggle(o.value)}
              >
                <span className={checked ? 'ms-check checked' : 'ms-check'}>
                  {checked && <CheckIcon size={12} />}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
