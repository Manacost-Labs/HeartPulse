import React from 'react';
import '../adminCrm.css';

export type AdminFilterChip<Id extends string> = { id: Id; label: string; count?: number };

export type AdminFilterChipsProps<Id extends string> = {
  label: string;
  options: ReadonlyArray<AdminFilterChip<Id>>;
  value: Id;
  onChange: (id: Id) => void;
  /** Tag-style chips are lighter; used for secondary filters such as subscription levels. */
  secondary?: boolean;
};

const formatCount = (count: number) => count.toLocaleString('ru-RU');

/** A single-choice row of filter chips with counts, styled like the people segments. */
export function AdminFilterChips<Id extends string>({ label, options, value, onChange, secondary = false }: AdminFilterChipsProps<Id>) {
  return (
    <div role="group" aria-label={label} className={`admin-crm-segment-row${secondary ? ' is-tags' : ''}`}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className={`admin-crm-segment${secondary ? ' is-tag' : ''}`}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {typeof option.count === 'number' && <span>{formatCount(option.count)}</span>}
        </button>
      ))}
    </div>
  );
}
