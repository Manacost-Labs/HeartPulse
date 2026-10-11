import React from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { battlegroundMinionIconBySlug } from '../model/minionTypeIcons';
import './LibraryControls.css';

type Option = { value: string; label: string; disabled?: boolean };
type FilterSelection = { id: string; label: string; remove: () => void };
export type LibraryControlsProps = {
  sections: Option[]; pools: Option[]; section: string; pool: string;
  onSection: (value: string) => void; onPool: (value: string) => void;
  query: string; onQuery: (value: string) => void;
  tiers: string[]; onTier: (value: string) => void; onClearTiers: () => void;
  races: [string, string][]; selectedRaces: string[];
  onRace: (value: string) => void; onClearRaces: () => void;
  mechanics: [string, string][]; mechanic: string; onMechanic: (value: string) => void;
  groups: [string, string][]; group: string; onGroup: (value: string) => void;
  duos: boolean; onDuos: () => void;
  selections: FilterSelection[]; onReset: () => void;
  resultCount: number; totalCount: number;
};

function SelectionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <fieldset className="bg-library-control-row"><legend>{label}</legend><div>{children}</div></fieldset>;
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="bg-library-choice" aria-pressed={active} onClick={onClick}>{children}</button>;
}

function CatalogSelect({ label, value, options, onChange }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
}) {
  return <label className="bg-library-control-select"><span>{label}</span>
    <select value={value} onChange={event => onChange(event.target.value)}>
      {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
  </label>;
}

export function LibraryControls(props: LibraryControlsProps) {
  return <section className="bg-library-controls" aria-label="Управление библиотекой">
    <div className="bg-library-controls-heading" data-tour-id="bg-library-directory">
      <div className="bg-library-catalog-selects">
        <CatalogSelect label="Раздел" value={props.section} options={props.sections} onChange={props.onSection} />
        <CatalogSelect label="Пул" value={props.pool} options={props.pools} onChange={props.onPool} />
      </div>
      <p role="status" aria-live="polite">{props.resultCount.toLocaleString('ru-RU')} найдено · {props.totalCount.toLocaleString('ru-RU')} загружено</p>
    </div>
    <label className="bg-library-control-search" data-tour-id="bg-library-search">
      <Search size={18} aria-hidden="true" />
      <input type="search" aria-label="Поиск карт" placeholder="Название, ID или механика…"
        value={props.query} onChange={event => props.onQuery(event.target.value)} />
    </label>
    <div data-tour-id="bg-library-filters">
      <SelectionRow label="Таверна">
        <Choice active={!props.tiers.length} onClick={props.onClearTiers}>Все</Choice>
        {[1, 2, 3, 4, 5, 6, 7].map(tier => <Choice key={tier} active={props.tiers.includes(String(tier))} onClick={() => props.onTier(String(tier))}>
          <span aria-label={`Таверна ${tier}`}>{tier}</span>
        </Choice>)}
      </SelectionRow>
      {props.races.length > 0 && <SelectionRow label="Тип существа">
        <Choice active={!props.selectedRaces.length} onClick={props.onClearRaces}>Все типы</Choice>
        {props.races.map(([slug, label]) => <Choice key={slug} active={props.selectedRaces.includes(slug)} onClick={() => props.onRace(slug)}>
          {battlegroundMinionIconBySlug[slug] && <img src={battlegroundMinionIconBySlug[slug]} alt="" loading="lazy" />}{label}
        </Choice>)}
      </SelectionRow>}
    </div>
    <details className="bg-library-control-advanced">
      <summary>Дополнительно <ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="bg-library-control-advanced-fields">
        <label className="bg-library-control-duos"><input type="checkbox" checked={props.duos} onChange={props.onDuos} />Показывать карты Duo</label>
        <CatalogSelect label="Механика" value={props.mechanic} options={[{ value: 'ALL', label: 'Все механики' }, ...props.mechanics.map(([value, label]) => ({ value, label }))]} onChange={props.onMechanic} />
        {props.groups.length > 1 && <CatalogSelect label="Группа" value={props.group} options={[{ value: 'ALL', label: 'Все группы' }, ...props.groups.map(([value, label]) => ({ value, label }))]} onChange={props.onGroup} />}
      </div>
    </details>
    {props.selections.length > 0 && <div className="bg-library-active-filters" aria-label="Выбранные фильтры">
      {props.selections.map(selection => <button key={selection.id} type="button" onClick={selection.remove} aria-label={`Убрать фильтр: ${selection.label}`}>
        {selection.label}<X size={14} aria-hidden="true" />
      </button>)}
      <button type="button" onClick={props.onReset}>Сбросить всё</button>
    </div>}
  </section>;
}
