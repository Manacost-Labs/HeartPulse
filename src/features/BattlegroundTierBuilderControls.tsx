import { useState, type ReactNode } from 'react';
import {
  DEFAULT_TIER_BUILDER_FILTERS, TIER_BUILDER_RACE_NAMES, TIER_BUILDER_SOURCES, withTierBuilderSource, type TierBuilderFilters,
} from '../modules/battlegrounds/public';
import { TIER_BUILDER_BACKGROUNDS, type TierBuilderBackground } from './battlegroundTierBuilderExport';
import { readStorage, writeStorage } from './battlegroundTierBuilderDraft';

const BACKGROUND_KEY = 'hero-tier-builder-background-mode-v1';
const RACE_ORDER = ['ALL', 'NONE', 'ABERRATION', 'BEAST', 'DEMON', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC', 'NAGA', 'PIRATE', 'QUILBOAR', 'UNDEAD'];
const RACE_ICONS: Record<string, string> = {
  ALL: 'общее', NONE: 'общее', ABERRATION: 'aberration', BEAST: 'зверь', DEMON: 'демоны', DRAGON: 'драконы',
  ELEMENTAL: 'элементали', MECHANICAL: 'механизмы', MURLOC: 'мурлоки', NAGA: 'наги', PIRATE: 'пираты',
  QUILBOAR: 'свинобразы', UNDEAD: 'нежить',
};
const LEVELS = ['ALL', '1', '2', '3', '4', '5', '6', '7'];
const SIZES = [{ value: 'ALL', label: 'Все аксессуары' }, { value: 'SMALL', label: 'Только малые' }, { value: 'LARGE', label: 'Только большие' }] as const;

function Chip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: string; children: ReactNode }) {
  return <button type="button" className="bg-tier-builder__chip" aria-pressed={active} onClick={onClick}>
    {icon && <img src={icon} alt="" width={20} height={20} loading="lazy" decoding="async" />}
    {children}
  </button>;
}

function FilterGroup({ title, hidden, children }: { title: string; hidden?: boolean; children: ReactNode }) {
  if (hidden) return null;
  return <fieldset className="bg-tier-builder__group">
    <legend>{title}</legend>
    <div className="bg-tier-builder__chips">{children}</div>
  </fieldset>;
}

export function TierBuilderFilterPanel({ filters, onChange, onClear, assigned, poolCount, loaded }: {
  filters: TierBuilderFilters; onChange: (filters: TierBuilderFilters) => void; onClear: () => void;
  assigned: number; poolCount: number; loaded: boolean;
}) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || (window.matchMedia?.('(min-width: 1100px)').matches ?? true));
  const source = filters.source;
  return (
    <aside className="bg-tier-builder__filters" aria-label="Фильтры пула карт">
      <label className="bg-tier-builder__search" data-tour-id="bg-tier-builder-search">
        <span>Поиск по картам (RU / EN)</span>
        <input id="tier-builder-search" type="search" value={filters.search}
          placeholder="Например, мурлок, murloc, deathrattle, Тюремщик"
          onChange={event => onChange({ ...filters, search: event.target.value })} />
      </label>
      <div data-tour-id="bg-tier-builder-source">
        <FilterGroup title="Источник">
          {TIER_BUILDER_SOURCES.map(option => <Chip key={option.value} active={source === option.value}
            onClick={() => onChange(withTierBuilderSource(filters, option.value))}>{option.label}</Chip>)}
        </FilterGroup>
      </div>
      {/* On a phone the board follows the filters, so the narrowing ones start folded. */}
      <details className="bg-tier-builder__more" data-tour-id="bg-tier-builder-filters" open={open}
        onToggle={event => setOpen(event.currentTarget.open)}>
        <summary>Тип, уровень и размер</summary>
        <FilterGroup title="Тип существа" hidden={source !== 'ALL' && source !== 'MINION'}>
          {RACE_ORDER.map(race => <Chip key={race} active={filters.race === race} icon={`/bg-legacy/assset/${RACE_ICONS[race]}.webp`}
            onClick={() => onChange({ ...filters, race })}>{TIER_BUILDER_RACE_NAMES[race]}</Chip>)}
        </FilterGroup>
        <FilterGroup title="Уровень таверны" hidden={source === 'HERO' || source === 'ACCESSORY'}>
          {LEVELS.map(level => <Chip key={level} active={filters.level === level}
            {...(level === 'ALL' ? {} : { icon: `/bg-legacy/assset/tier${level}.png` })}
            onClick={() => onChange({ ...filters, level })}>{level === 'ALL' ? 'Все уровни' : `Таверна ${level}`}</Chip>)}
        </FilterGroup>
        <FilterGroup title="Размер аксессуара" hidden={source !== 'ACCESSORY'}>
          {SIZES.map(size => <Chip key={size.value} active={filters.accessorySize === size.value}
            onClick={() => onChange({ ...filters, accessorySize: size.value })}>{size.label}</Chip>)}
        </FilterGroup>
      </details>
      <div className="bg-tier-builder__actions" data-tour-id="bg-tier-builder-reset">
        <button id="tier-builder-reset" type="button" className="bg-tier-builder__button" onClick={() => onChange(DEFAULT_TIER_BUILDER_FILTERS)}>Сбросить</button>
        <button id="tier-builder-unassigned" type="button" className="bg-tier-builder__button" disabled={!assigned} onClick={onClear}>Все в пул</button>
      </div>
      <p id="tier-builder-summary" className="bg-tier-builder__summary" data-tour-id="bg-tier-builder-library" aria-live="polite">
        {loaded ? `В пуле ${poolCount} карт по текущим фильтрам. Всего распределено ${assigned}.` : 'Загружаю библиотеку...'}
      </p>
    </aside>
  );
}

export function TierBuilderToolbar({ assigned, exporting, onExport, canUndo, onUndo, draftStatus, exportStatus }: {
  assigned: number; exporting: 'png' | 'webp' | null; onExport: (fileType: 'png' | 'webp', background: TierBuilderBackground) => void;
  canUndo: boolean; onUndo: () => void; draftStatus: string; exportStatus: string;
}) {
  const [background, setBackground] = useState<TierBuilderBackground>(() => {
    const saved = readStorage(BACKGROUND_KEY);
    return TIER_BUILDER_BACKGROUNDS.some(option => option.value === saved) ? saved as TierBuilderBackground : 'transparent';
  });
  return (
    <div className="bg-tier-builder__toolbar" data-tour-id="bg-tier-builder-export">
      <button id="tier-builder-download-all-png" type="button" className="bg-tier-builder__button bg-tier-builder__button--primary"
        disabled={!assigned || !!exporting} onClick={() => onExport('png', background)}>{exporting === 'png' ? 'Готовлю…' : 'Скачать всё PNG'}</button>
      <button id="tier-builder-download-all-webp" type="button" className="bg-tier-builder__button"
        disabled={!assigned || !!exporting} onClick={() => onExport('webp', background)}>{exporting === 'webp' ? 'Готовлю…' : 'Скачать всё WebP'}</button>
      <div className="bg-tier-builder__backgrounds" role="group" aria-label="Фон экспорта">
        {TIER_BUILDER_BACKGROUNDS.map(option => <button key={option.value} type="button" aria-label={option.label} title={option.label}
          aria-pressed={background === option.value} className="bg-tier-builder__background"
          style={option.url ? { backgroundImage: `url("${option.url}")` } : undefined}
          onClick={() => { setBackground(option.value); writeStorage(BACKGROUND_KEY, option.value); }}>
          {option.url ? '' : '∅'}
        </button>)}
      </div>
      <button type="button" className="bg-tier-builder__button builder-undo" disabled={!canUndo} onClick={onUndo}>Отменить</button>
      <p className="builder-draft-status" role="status">{draftStatus}</p>
      <p className="builder-export-status" role="status" hidden={!exportStatus}>{exportStatus}</p>
    </div>
  );
}
