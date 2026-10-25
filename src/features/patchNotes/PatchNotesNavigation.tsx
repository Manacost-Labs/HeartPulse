import { useId } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { patchNotesHref, type PatchFilter, type PatchKind, type PatchNotesSummary, type PatchView } from '../../modules/patchNotes/public';
import { ArchiveDrawer } from './PatchArchive';
import { PatchJump, type PatchTocEntry } from './PatchToc';

/* Ways around one patch: the version switcher in the header, anchors of sections and groups, and the sticky bar of filters. */

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

/* The header digest names each kind with the same marks, so a toggle is its mark alone; its name is the label. */
const KIND_FILTERS: { kind: PatchKind; label: string; Icon: typeof ArrowUp }[] = [
  { kind: 'buff', label: 'Только усиления', Icon: ArrowUp },
  { kind: 'nerf', label: 'Только ослабления', Icon: ArrowDown },
  { kind: 'rework', label: 'Только переработки', Icon: RefreshCw },
];

/**
 * The sticky bar of filters: the search and the kind toggles, and on narrow
 * content the jump select over `toc`, which stands in for the table of contents.
 * On wide content the whole bar sticks under the site header; on narrow
 * content only the jump and kind row sticks and the search scrolls away.
 */
export function PatchBar({ view, filter, onChange, toc }: {
  view: PatchView; filter: PatchFilter; onChange: (next: Partial<PatchFilter>) => void; toc: PatchTocEntry[] | null;
}) {
  const searchId = useId();
  return (
    <div className="hp-patch-bar" role="group" aria-label="Фильтры изменений" data-tour-id="patch-filters">
      <div className="hp-patch-search">
        <Search aria-hidden="true" />
        <label htmlFor={searchId} className="sr-only">Найти карту в патче</label>
        <input id={searchId} type="search" value={filter.query} placeholder="Поиск карты"
          autoComplete="off" onChange={event => onChange({ query: event.target.value })} />
      </div>
      <div className="hp-patch-bar__sticky">
        {toc && <PatchJump entries={toc} />}
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
