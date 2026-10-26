import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { BATTLEGROUND_TIER_LISTS, type BattlegroundTierListKey } from '../model/tierList';

export type TierListToolbarProps = {
  list: BattlegroundTierListKey;
  onList: (list: BattlegroundTierListKey) => void;
  /** Count, source and refresh time of the loaded list. */
  meta: string;
  /** Filters that stay visible: one row of choices. */
  primary?: ReactNode;
  /** Filters behind a toggle whose label is a summary of their current values. */
  secondary?: { summary: string; content: ReactNode };
};

export function TierListChoice({ active, onClick, label, children }: {
  active: boolean;
  onClick: () => void;
  label?: string;
  children: ReactNode;
}) {
  return <button type="button" className="bg-tierlist-choice" aria-pressed={active} aria-label={label} title={label} onClick={onClick}>
    {children}
  </button>;
}

/**
 * A labelled group of choices. `legend` shows the label (secondary panel);
 * `scroll` keeps a long icon row on one line on phones instead of wrapping.
 */
export function TierListChoices({ label, legend = false, scroll = false, children }: {
  label: string;
  legend?: boolean;
  scroll?: boolean;
  children: ReactNode;
}) {
  return <div className={`bg-tierlist-choices${scroll ? ' bg-tierlist-choices--scroll' : ''}`} role="group" aria-label={label}>
    {legend && <span className="bg-tierlist-choices__legend" aria-hidden="true">{label}</span>}
    <div className="bg-tierlist-choices__items">{children}</div>
  </div>;
}

/** One compact control bar for every Battlegrounds tier list. */
export function TierListToolbar({ list, onList, meta, primary, secondary }: TierListToolbarProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return <div className="bg-tierlist-toolbar">
    <div className="bg-tierlist-toolbar__row">
      <div className="bg-tierlist-tabs" role="group" aria-label="Тип тир-листа" data-tour-id="bg-tier-list-switcher">
        {BATTLEGROUND_TIER_LISTS.map(entry => <button key={entry.id} type="button" aria-pressed={entry.id === list}
          data-tour-id={entry.id === 'strategies' ? 'bg-tier-list-strategy' : undefined} onClick={() => onList(entry.id)}>
          {entry.label}
        </button>)}
      </div>
      <p className="bg-tierlist-toolbar__meta" role="status">{meta}</p>
    </div>
    {(primary || secondary) && <div className="bg-tierlist-toolbar__filters" data-tour-id="bg-tier-list-filters">
      <div className="bg-tierlist-toolbar__row">
        {primary}
        {secondary && <button type="button" className="bg-tierlist-more" aria-expanded={open} aria-controls={panelId}
          onClick={() => setOpen(value => !value)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>{secondary.summary}</span>
          <ChevronDown className="bg-tierlist-more__chevron" size={16} aria-hidden="true" />
        </button>}
      </div>
      {secondary && <div id={panelId} className="bg-tierlist-toolbar__more" hidden={!open}>{secondary.content}</div>}
    </div>}
  </div>;
}
