import { LockKeyhole } from 'lucide-react';

/** A cell of a closed figure in the hero table for a viewer without access: the press opens the subscription offer. */
export function LockedCell({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="bg-hero-ledger__locked" onClick={onClick} title="Доступно по подписке">
      <LockKeyhole aria-hidden="true" />
      <span>По подписке</span>
    </button>
  );
}
