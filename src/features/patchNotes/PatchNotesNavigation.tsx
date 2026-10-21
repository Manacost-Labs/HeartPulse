import { useId } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { patchNotesHref, type PatchFilter, type PatchNotesSummary, type PatchView } from '../../modules/patchNotes/public';
import { KINDS, KIND_LABELS } from './PatchCard';

/* Ways around one patch: the version switcher, the table of contents and the filters. */

export function sectionAnchor(id: string) {
  return `hp-patch-section-${id}`;
}

export function groupAnchor(id: string) {
  return `hp-patch-group-${id.replace(/[^a-zа-яё0-9]+/giu, '-')}`;
}

export function VersionSwitcher({ patches, current, onSelect, className }: {
  patches: PatchNotesSummary[]; current: string; onSelect: (href: string) => void; className: string;
}) {
  const id = useId();
  const index = patches.findIndex(patch => patch.version === current);
  const href = (position: number) => patchNotesHref(position === 0 ? null : patches[position].version);
  const newer = index > 0 ? index - 1 : null;
  const older = index !== -1 && index < patches.length - 1 ? index + 1 : null;
  return (
    <nav className={`hp-patch-versions ${className}`} aria-label="Версии патча">
      {newer !== null
        ? <a href={href(newer)} aria-label={`Более новый патч ${patches[newer].version}`}><ChevronLeft aria-hidden="true" /></a>
        : <span aria-hidden="true"><ChevronLeft /></span>}
      <label htmlFor={id} className="sr-only">Версия патча</label>
      <select id={id} value={current} onChange={event => {
        const position = patches.findIndex(patch => patch.version === event.target.value);
        if (position !== -1) onSelect(href(position));
      }}>
        {index === -1 && <option value={current}>{current}</option>}
        {patches.map(patch => (
          <option key={patch.version} value={patch.version}>{patch.version} · {patch.changeCount} изм.</option>
        ))}
      </select>
      {older !== null
        ? <a href={href(older)} aria-label={`Более старый патч ${patches[older].version}`}><ChevronRight aria-hidden="true" /></a>
        : <span aria-hidden="true"><ChevronRight /></span>}
    </nav>
  );
}

/** Sticks under the site header while reading: the version, search and the buff/nerf filter stay at hand. */
export function Toolbar({ view, filter, version, onChange }: {
  view: PatchView; filter: PatchFilter; version: string; onChange: (next: Partial<PatchFilter>) => void;
}) {
  const searchId = useId();
  return (
    <div className="hp-patch-toolbar" role="group" aria-label="Фильтры изменений">
      <span className="hp-patch-toolbar__version">Патч {version}</span>
      <div className="hp-patch-search">
        <Search aria-hidden="true" />
        <label htmlFor={searchId} className="sr-only">Найти карту в патче</label>
        <input id={searchId} type="search" value={filter.query} placeholder="Найти карту или текст изменения"
          autoComplete="off" onChange={event => onChange({ query: event.target.value })} />
      </div>
      <div className="hp-patch-kinds" role="group" aria-label="Тип изменения">
        <button type="button" aria-pressed={filter.kind === 'all'} onClick={() => onChange({ kind: 'all' })}>
          Все <span>{view.total}</span>
        </button>
        {KINDS.map(kind => (
          <button key={kind} type="button" data-kind={kind} aria-pressed={filter.kind === kind}
            disabled={view.kinds[kind] === 0 && filter.kind !== kind} onClick={() => onChange({ kind })}>
            {KIND_LABELS[kind].only} <span>{view.kinds[kind]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The neighbouring patches of the archive, at the end of the page. */
export function PatchPager({ patches, current }: { patches: PatchNotesSummary[]; current: string }) {
  const index = patches.findIndex(patch => patch.version === current);
  if (index === -1) return null;
  const href = (position: number) => patchNotesHref(position === 0 ? null : patches[position].version);
  const older = patches[index + 1];
  const newer = index > 0 ? patches[index - 1] : null;
  if (!older && !newer) return null;
  return (
    <nav className="hp-patch-pager" aria-label="Соседние патчи">
      {older ? (
        <a href={href(index + 1)} rel="prev">
          <ChevronLeft aria-hidden="true" />
          <span><small>Предыдущий патч</small>{older.version} · {older.changeCount} изм.</span>
        </a>
      ) : <span />}
      {newer && (
        <a href={href(index - 1)} rel="next" data-side="next">
          <span><small>Следующий патч</small>{newer.version} · {newer.changeCount} изм.</span>
          <ChevronRight aria-hidden="true" />
        </a>
      )}
    </nav>
  );
}

/** Opens a collapsed section before the browser scrolls to its anchor. */
function openTarget(hash: string) {
  const target = document.getElementById(hash.slice(1));
  const details = target?.closest('details') ?? (target instanceof HTMLDetailsElement ? target : null);
  if (details) details.open = true;
}

export function Contents({ view, className }: { view: PatchView; className: string }) {
  return (
    <nav className={`hp-patch-toc ${className}`} aria-label="Содержание патча">
      <p className="hp-patch-toc__title">Содержание</p>
      <ol>
        {view.sections.map(section => (
          <li key={section.id}>
            <a href={`#${sectionAnchor(section.id)}`} onClick={event => openTarget(event.currentTarget.hash)}>
              {section.title} <span>{section.count}</span>
            </a>
            {view.groups.filter(group => group.section === section.id).length > 1 && (
              <ol>
                {view.groups.filter(group => group.section === section.id).map(group => (
                  <li key={group.id}>
                    <a href={`#${groupAnchor(group.id)}`} onClick={event => openTarget(event.currentTarget.hash)}>
                      {group.title} <span>{group.entries.length}</span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

