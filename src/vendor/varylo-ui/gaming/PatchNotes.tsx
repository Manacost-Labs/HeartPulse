'use client';

import { createElement, Fragment, useDeferredValue, useId, useMemo, useState, type ComponentPropsWithRef, type CSSProperties, type ReactNode } from 'react';
import { cx, useControllableState } from '../primitives';
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon } from '../icons';
import { SearchInput } from '../forms/SearchInput';
import { SegmentedControl } from '../navigation/SegmentedControl';
import { useLocale, useTimeZone } from '../theme/ThemeProvider';
import { formatArticleDate, isoDate, type DateInput } from '../editorial/utils';
import { useLabels } from '../agents/labels';
import type { GameImageSource } from './game';
import { changeDirection, entryChanges, entryKind, patchSummary, wordDiff, type PatchChangeKind, type PatchEntry, type PatchValueChange } from './patch';
import { GameImage } from './picture';
import './PatchNotes.css';

export type PatchNotesFilter = PatchChangeKind | 'all';

export interface PatchSection {
  id: string;
  title: string;
}

export interface PatchNotesLabels {
  title: string;
  filter: string;
  all: string;
  /** Filter chips: plural, "Buffs". */
  kinds: Record<PatchChangeKind, string>;
  /** Badge on one entry: singular, "Buff". */
  entryKinds: Record<PatchChangeKind, string>;
  /** Filter chip text with its count. */
  chip: (kind: string, count: string) => string;
  /** Name of the section switch. */
  sectionFilter: string;
  /** First option of the section switch. */
  allSections: string;
  search: string;
  /** Read before an old value. */
  before: string;
  /** Read before a new value. */
  after: string;
  /** Read for a change in the good / bad direction. */
  better: string;
  worse: string;
  /** Section of entries without one. */
  other: string;
  developerNote: string;
  noResults: string;
}

const DEFAULT_LABELS: PatchNotesLabels = {
  title: 'Patch notes',
  filter: 'Show',
  all: 'All',
  kinds: { buff: 'Buffs', nerf: 'Nerfs', rework: 'Adjustments', new: 'New', removed: 'Removed', fix: 'Fixes' },
  entryKinds: { buff: 'Buff', nerf: 'Nerf', rework: 'Adjusted', new: 'New', removed: 'Removed', fix: 'Fix' },
  chip: (kind, count) => `${kind} ${count}`,
  sectionFilter: 'Section',
  allSections: 'Everything',
  search: 'Find a change',
  before: 'was',
  after: 'now',
  better: 'better',
  worse: 'worse',
  other: 'Other changes',
  developerNote: 'Developer comment',
  noResults: 'No change matches the filters.',
};

const KINDS: PatchChangeKind[] = ['buff', 'nerf', 'rework', 'new', 'removed', 'fix'];

export interface PatchNotesProps extends Omit<ComponentPropsWithRef<'section'>, 'title' | 'children'> {
  /** Changed champions, items, runes and mechanics. */
  entries: PatchEntry[];
  /** Sections in order; entries are grouped under them and, with two or more, a switch shows one. */
  sections?: PatchSection[];
  /** Patch name or number, shown next to the heading. */
  version?: ReactNode;
  /** Release date. */
  date?: DateInput;
  /** Wide picture over the heading, e.g. a splash art: an image URL or a node. */
  cover?: GameImageSource;
  /** Alt text of the cover. Default empty: decorative. */
  coverAlt?: string;
  /** CSS `object-position` of the cover, to keep the subject in the crop. Default `center 30%`. */
  coverPosition?: string;
  /** Kind of change shown. */
  filter?: PatchNotesFilter;
  /** Initial filter when uncontrolled. Default `all`. */
  defaultFilter?: PatchNotesFilter;
  /** Called when the reader picks a filter chip. */
  onFilterChange?: (filter: PatchNotesFilter) => void;
  /** Section id shown; `''` shows every section. */
  sectionFilter?: string;
  /** Initial section when uncontrolled. Default `''`. */
  defaultSectionFilter?: string;
  /** Called when the reader picks a section. */
  onSectionFilterChange?: (section: string) => void;
  /** Shows the search field. Default true. */
  searchable?: boolean;
  /** Heading. Default: `labels.title`. */
  title?: ReactNode;
  /** Level of the heading; sections and entries go one and two levels below (default 2). */
  headingLevel?: 2 | 3 | 4;
  /** IANA time zone of the date (default: the ThemeProvider's, then the reader's). */
  timeZone?: string;
  /** BCP 47 locale for numbers and the date; defaults to the ThemeProvider's. */
  locale?: string;
  labels?: Partial<Omit<PatchNotesLabels, 'kinds' | 'entryKinds'>> & {
    kinds?: Partial<Record<PatchChangeKind, string>>;
    entryKinds?: Partial<Record<PatchChangeKind, string>>;
  };
}

/**
 * Patch notes as players read them: champions and items with their portraits, changes grouped by ability with the
 * ability icon, every value as was → now coloured by whether it helps, ability text diffed word by word, buff, nerf
 * and adjustment badges, developer comments, and filters by kind, section and name. An optional splash heads it.
 */
export function PatchNotes({
  entries,
  sections = [],
  version,
  date,
  cover,
  coverAlt = '',
  coverPosition = 'center 30%',
  filter: filterProp,
  defaultFilter = 'all',
  onFilterChange,
  sectionFilter: sectionFilterProp,
  defaultSectionFilter = '',
  onSectionFilterChange,
  searchable = true,
  title,
  headingLevel = 2,
  timeZone: timeZoneProp,
  locale: localeProp,
  labels,
  className,
  ref,
  ...rest
}: PatchNotesProps) {
  const locale = useLocale(localeProp);
  const timeZone = useTimeZone(timeZoneProp);
  const copy = useLabels(DEFAULT_LABELS, labels);
  const uid = useId();
  const [filter, setFilter] = useControllableState<PatchNotesFilter>({ value: filterProp, defaultValue: defaultFilter, onChange: onFilterChange });
  const [sectionState, setSection] = useControllableState({ value: sectionFilterProp, defaultValue: defaultSectionFilter, onChange: onSectionFilterChange });
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale]);
  const section = sections.some((s) => s.id === sectionState) ? sectionState : '';
  const inSection = useMemo(() => (section ? entries.filter((e) => e.section === section) : entries), [entries, section]);
  const summary = useMemo(() => patchSummary(inSection), [inSection]);

  const groups = useMemo(() => {
    const words = deferredQuery.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
    const shown = inSection.filter((entry) => {
      if (filter !== 'all' && entryKind(entry) !== filter) return false;
      if (!words.length) return true;
      const text = [entry.name, entry.subtitle ?? '', ...(entry.groups ?? []).map((g) => g.title), ...entryChanges(entry).map((c) => `${c.label} ${c.before ?? ''} ${c.after ?? ''}`)]
        .join(' ')
        .toLocaleLowerCase(locale);
      return words.every((w) => text.includes(w));
    });
    const known = new Set(sections.map((s) => s.id));
    const out = sections.map((s) => ({ id: s.id, title: s.title, entries: shown.filter((e) => e.section === s.id) }));
    out.push({ id: '', title: copy.other, entries: shown.filter((e) => !e.section || !known.has(e.section)) });
    return out.filter((g) => g.entries.length > 0);
  }, [inSection, sections, filter, deferredQuery, locale, copy.other]);

  const value = (v: number | string, unit?: string) => (typeof v === 'number' ? `${number.format(v)}${unit ?? ''}` : v);
  const sub = (level: number) => Math.min(6, headingLevel + level);

  const renderChange = (change: PatchValueChange, i: number) => {
    const direction = changeDirection(change);
    const textual = typeof change.before === 'string' && typeof change.after === 'string' && /\s/.test(`${change.before}${change.after}`);
    let diff: ReactNode;
    if (textual) {
      diff = (
        <span className="ui-patch-notes__text">
          {wordDiff(change.before as string, change.after as string).map((token, t) =>
            token.op === 'same' ? (
              <Fragment key={t}>{token.text}</Fragment>
            ) : token.op === 'remove' ? (
              <del key={t}>
                <span className="ui-sr-only">{`[${copy.before}: `}</span>
                {token.text}
                <span className="ui-sr-only">]</span>
              </del>
            ) : (
              <ins key={t}>
                <span className="ui-sr-only">{`[${copy.after}: `}</span>
                {token.text}
                <span className="ui-sr-only">]</span>
              </ins>
            ),
          )}
        </span>
      );
    } else {
      const up =
        typeof change.before === 'number' && typeof change.after === 'number'
          ? change.after > change.before
          : (direction === 'buff') === ((change.better ?? 'higher') === 'higher');
      diff = (
        <span className="ui-patch-notes__values">
          {change.before !== undefined && (
            <del>
              <span className="ui-sr-only">{`${copy.before} `}</span>
              {value(change.before, change.unit)}
            </del>
          )}
          {change.before !== undefined && change.after !== undefined && <ArrowRightIcon className="ui-patch-notes__arrow" aria-hidden="true" />}
          {/* The new value keeps its direction mark on the same line. */}
          <span className="ui-patch-notes__now">
            {change.after !== undefined && (
              <ins>
                <span className="ui-sr-only">{`${copy.after} `}</span>
                {value(change.after, change.unit)}
              </ins>
            )}
            {direction !== 'neutral' && (
              <span className="ui-patch-notes__direction" data-direction={direction}>
                {up ? <ArrowUpIcon aria-hidden="true" /> : <ArrowDownIcon aria-hidden="true" />}
                <span className="ui-sr-only">{direction === 'buff' ? copy.better : copy.worse}</span>
              </span>
            )}
          </span>
        </span>
      );
    }
    return (
      <li key={i} className="ui-patch-notes__change" data-direction={direction} data-textual={textual || undefined}>
        <span className="ui-patch-notes__label">{change.label}</span>
        {diff}
      </li>
    );
  };

  const heading = createElement(`h${headingLevel}`, { className: 'ui-patch-notes__title', id: `${uid}-title` }, title ?? copy.title);
  const coverNode =
    typeof cover === 'string' && cover ? (
      <img src={cover} alt={coverAlt} loading="lazy" decoding="async" draggable={false} style={{ objectPosition: coverPosition } as CSSProperties} />
    ) : (
      cover
    );

  return (
    <section ref={ref} className={cx('ui-patch-notes', className)} aria-labelledby={`${uid}-title`} {...rest}>
      {coverNode != null && coverNode !== '' && <figure className="ui-patch-notes__cover">{coverNode}</figure>}
      <header className="ui-patch-notes__header">
        <div className="ui-patch-notes__heading">
          {heading}
          {(version || date !== undefined) && (
            <p className="ui-patch-notes__meta">
              {version && <span className="ui-patch-notes__version">{version}</span>}
              {date !== undefined && <time dateTime={isoDate(date)}>{formatArticleDate(date, locale, timeZone)}</time>}
            </p>
          )}
        </div>
        <div className="ui-patch-notes__tools">
          {sections.length > 1 && (
            <SegmentedControl
              size="sm"
              className="ui-patch-notes__sections"
              aria-label={copy.sectionFilter}
              value={section}
              onValueChange={setSection}
              options={[{ value: '', label: copy.allSections }, ...sections.map((s) => ({ value: s.id, label: s.title }))]}
            />
          )}
          <div className="ui-patch-notes__chips" role="group" aria-label={copy.filter}>
            <button type="button" className="ui-patch-notes__chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              {copy.chip(copy.all, number.format(inSection.length))}
            </button>
            {KINDS.filter((kind) => summary[kind] > 0 || filter === kind).map((kind) => (
              <button key={kind} type="button" className="ui-patch-notes__chip" data-kind={kind} aria-pressed={filter === kind} onClick={() => setFilter(filter === kind ? 'all' : kind)}>
                {copy.chip(copy.kinds[kind], number.format(summary[kind]))}
              </button>
            ))}
          </div>
          {searchable && <SearchInput className="ui-patch-notes__search" size="sm" aria-label={copy.search} placeholder={copy.search} value={query} onValueChange={setQuery} />}
        </div>
      </header>

      {groups.length === 0 && <p className="ui-patch-notes__empty">{copy.noResults}</p>}
      {groups.map((group) => (
        <section key={group.id || 'other'} className="ui-patch-notes__section" aria-labelledby={`${uid}-s-${group.id}`}>
          {createElement(
            `h${sub(1)}`,
            { className: 'ui-patch-notes__section-title', id: `${uid}-s-${group.id}` },
            group.title,
            <span key="count" className="ui-patch-notes__section-count" aria-hidden="true">
              {number.format(group.entries.length)}
            </span>,
          )}
          <div className="ui-patch-notes__entries ui-panel">
            {group.entries.map((entry) => {
              const kind = entryKind(entry);
              return (
                <article key={entry.id} className="ui-patch-notes__entry" data-kind={kind} aria-labelledby={`${uid}-e-${entry.id}`}>
                  <header className="ui-patch-notes__entry-header">
                    <GameImage className="ui-patch-notes__portrait" src={entry.image} name={entry.name} size={44} />
                    <div className="ui-patch-notes__names">
                      {createElement(`h${sub(2)}`, { className: 'ui-patch-notes__name', id: `${uid}-e-${entry.id}` }, entry.name)}
                      {entry.subtitle && <span className="ui-patch-notes__subtitle">{entry.subtitle}</span>}
                    </div>
                    <span className="ui-patch-notes__kind" data-kind={kind}>
                      {copy.entryKinds[kind]}
                    </span>
                  </header>
                  {(entry.changes?.length ?? 0) > 0 && <ul className="ui-patch-notes__changes">{entry.changes!.map(renderChange)}</ul>}
                  {entry.groups?.map((g, gi) => (
                    <div key={gi} className="ui-patch-notes__group">
                      <div className="ui-patch-notes__group-head">
                        {g.image !== undefined && <GameImage className="ui-patch-notes__ability" src={g.image} name={g.key ?? g.title} initials={g.key} size={28} />}
                        {g.key && <span className="ui-patch-notes__key">{g.key}</span>}
                        <span className="ui-patch-notes__group-title">{g.title}</span>
                      </div>
                      <ul className="ui-patch-notes__changes">{g.changes.map(renderChange)}</ul>
                    </div>
                  ))}
                  {entry.note && (
                    <aside className="ui-patch-notes__note" aria-label={copy.developerNote}>
                      {entry.note}
                    </aside>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
