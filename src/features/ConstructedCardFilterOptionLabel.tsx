import { LockKeyhole } from 'lucide-react';
import type { ConstructedCardFilterOption } from './constructedCardFilterOptions';

/** An option's label; a choice closed to the viewer (`locked`) carries a lock after it. */
export function FilterOptionLabel({ option }: { option: ConstructedCardFilterOption }) {
  return <span>{option.label}{option.locked && <LockKeyhole className="constructed-cards__filter-lock" size={12} aria-hidden="true" />}</span>;
}

/** The accessible name of a closed choice: its label and «по подписке»; an open choice keeps the name of its text. */
export const lockedOptionName = (option: ConstructedCardFilterOption) => option.locked ? `${option.label}, по подписке` : undefined;
