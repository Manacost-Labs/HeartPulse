import { useId } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import {
  PATCH_SECTION_TITLES, patchNotesHref, type PatchFilter, type PatchKind, type PatchNotesSummary, type PatchView,
} from '../../modules/patchNotes/public';
import { ArchiveDrawer } from './PatchArchive';

/* Ways around one patch: the version switcher in the header and the one sticky bar of modes, search and filters. */

export function sectionAnchor(id: string) {
  return `hp-patch-section-${id}`;
}

export function groupAnchor(id: string) {
  return `hp-patch-group-${id.replace(/[^a-zа-яё0-9]+/giu, '-')}`;
}

/** Opens a collapsed section before the browser scrolls to its anchor. */
export function openTarget(hash: string) {
  const target = document.getElementById(hash.slice(1));
  const details = target?.closest('details') ?? (target instanceof HTMLDetailsElement ? target : null);
  if (details) details.open = true;
}

/** Newer and older neighbours around a compact select; the whole archive opens in the "Все патчи" drawer. */
export function VersionSwitcher({ patches, current, onSelect, formatDate }: {
  patches: PatchNotesSummary[]; current: string; onSelect: (href: string) => void; formatDate: (value: string | null) => string | null;
}) {
  const id = useId();
  const index = patches.findIndex(patch => patch.version === current);
  const href = (position: number) => patchNotesHref(position === 0 ? null : patches[position].version);
  const newer = index > 0 ? index - 1 : null;
  const older = index !== -1 && index < patches.length - 1 ? index + 1 : null;
  return (
    <nav className="hp-patch-versions" aria-label="Версии патча" data-tour-id="patch-versions">
      {older !== null
        ? <a href={href(older)} rel="prev" aria-label={`Более старый патч ${patches[older].version}`}><ChevronLeft aria-hidden="true" /></a>
        : <span aria-hidden="true"><ChevronLeft /></span>}
      <label htmlFor={id} className="sr-only">Версия патча</label>
      <select id={id} value={current} onChange={event => {
        const position = patches.findIndex(patch => patch.version === event.target.value);
        if (position !== -1) onSelect(href(position));
      }}>
        {index === -1 && <option value={current}>{`Патч ${current}`}</option>}
        {patches.map(patch => <option key={patch.version} value={patch.version}>{`Патч ${patch.version}`}</option>)}
      </select>
      {newer !== null
        ? <a href={href(newer)} rel="next" aria-label={`Более новый патч ${patches[newer].version}`}><ChevronRight aria-hidden="true" /></a>
        : <span aria-hidden="true"><ChevronRight /></span>}
      <ArchiveDrawer patches={patches} current={current} formatDate={formatDate} />
    </nav>
  );
}

/* The header counts each kind with the same marks, so a toggle is its mark alone; its name is the label. */
const KIND_FILTERS: { kind: PatchKind; label: string; Icon: typeof ArrowUp }[] = [
  { kind: 'buff', label: 'Только усиления', Icon: ArrowUp },
  { kind: 'nerf', label: 'Только ослабления', Icon: ArrowDown },
  { kind: 'rework', label: 'Только переработки', Icon: RefreshCw },
];

/**
 * The page's one navigation. On wide content it sticks under the site header
 * as a single row; on narrow content only the search and kind row sticks and
 * the modes and the class/type select scroll away with the header.
 */
export function PatchBar({ view, filter, onChange }: {
  view: PatchView; filter: PatchFilter; onChange: (next: Partial<PatchFilter>) => void;
}) {
  const searchId = useId();
  const groupId = useId();
  const sections = view.sections.filter(section => view.groups.some(group => group.section === section.id));
  return (
    <div className="hp-patch-bar">
      <div className="hp-patch-bar__nav">
        {sections.length > 1 && (
          <nav className="hp-patch-bar__modes" aria-label="Разделы патча" data-tour-id="patch-modes">
            {sections.map(section => (
              <a key={section.id} href={`#${sectionAnchor(section.id)}`} onClick={event => openTarget(event.currentTarget.hash)}>
                {section.title} <span>{section.count}</span>
              </a>
            ))}
          </nav>
        )}
        {view.groups.length > 1 && (
          <span className="hp-patch-bar__group" data-tour-id="patch-groups">
            <label htmlFor={groupId} className="sr-only">Класс или тип карт</label>
            <select id={groupId} value={filter.group} onChange={event => onChange({ group: event.target.value })}>
              <option value="all">Все классы и типы</option>
              {view.sections.map(section => {
                const groups = view.groups.filter(group => group.section === section.id);
                return groups.length > 0 && (
                  <optgroup key={section.id} label={PATCH_SECTION_TITLES[section.id]}>
                    {groups.map(group => <option key={group.id} value={group.id}>{`${group.title} · ${group.entries.length}`}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </span>
        )}
      </div>
      <div className="hp-patch-bar__filters" role="group" aria-label="Фильтры изменений" data-tour-id="patch-filters">
        <div className="hp-patch-search">
          <Search aria-hidden="true" />
          <label htmlFor={searchId} className="sr-only">Найти карту в патче</label>
          <input id={searchId} type="search" value={filter.query} placeholder="Поиск"
            autoComplete="off" onChange={event => onChange({ query: event.target.value })} />
        </div>
        <div className="hp-patch-kinds" role="group" aria-label="Тип изменения">
          <button type="button" aria-pressed={filter.kind === 'all'} onClick={() => onChange({ kind: 'all' })}>Все</button>
          {KIND_FILTERS.map(({ kind, label, Icon }) => (
            <button key={kind} type="button" data-kind={kind} aria-pressed={filter.kind === kind} title={label}
              aria-label={`${label}: ${view.kinds[kind]}`} disabled={view.kinds[kind] === 0 && filter.kind !== kind}
              onClick={() => onChange({ kind })}>
              <Icon aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
