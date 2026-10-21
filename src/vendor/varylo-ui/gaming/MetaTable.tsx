'use client';

import { createElement, useDeferredValue, useId, useMemo, useRef, useState, type ComponentPropsWithRef, type CSSProperties, type ReactNode } from 'react';
import { cx, useControllableState, useVirtualizer } from '../primitives';
import { AlertCircleIcon, ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, InfoIcon } from '../icons';
import { Skeleton } from '../basic/Skeleton';
import { SearchInput } from '../forms/SearchInput';
import { Select } from '../forms/Select';
import { SegmentedControl } from '../navigation/SegmentedControl';
import { useLocale } from '../theme/ThemeProvider';
import { useLabels } from '../agents/labels';
import { DEFAULT_TIERS, type GameRole, type TierDef } from './game';
import { GameImage, roleFilterOptions } from './picture';
import { metaTableRows, sortMetaTable, type MetaRate, type MetaTableEntry, type MetaTableRow, type MetaTableSort, type MetaTableSortKey } from './stats';
import { gameToneColor } from './tone';
import { TrendValue } from '../widgets/TrendValue';
import './game.css';
import './MetaTable.css';

export interface MetaRank {
  id: string;
  /** Shown in the rank picker: "All ranks", "Emerald+". */
  label: string;
}

/** A tier of the tier column. Rows without an explicit `tier` get the first whose `minWinRate` they reach. */
export interface MetaTier extends TierDef {
  minWinRate?: number;
}

/** S+ from 53.5% win rate, S from 52%, A from 51%, B from 50%, C from 48.5%, D below. */
export const DEFAULT_META_TIERS: MetaTier[] = DEFAULT_TIERS.map((tier, i) => ({ ...tier, minWinRate: [0.535, 0.52, 0.51, 0.5, 0.485, 0][i] }));

export interface MetaTableLabels {
  title: string;
  /** Name of the role filter. */
  roleFilter: string;
  /** First option of the role filter. */
  allRoles: string;
  /** Name of the rank picker. */
  rank: string;
  search: string;
  /** Header of the position column. */
  position: string;
  name: string;
  tier: string;
  winRate: string;
  pickRate: string;
  banRate: string;
  games: string;
  /** Read after a win rate: its 95% interval. */
  interval: (low: string, high: string) => string;
  /** Change against the previous patch in percentage points, e.g. "+1.2 pts". */
  change: (signed: string) => string;
  /** Read before the changes. */
  sinceLastPatch: string;
  lowSample: string;
  /** How many rows the filters leave. */
  count: (shown: number, total: number) => string;
  /** Name of the row button. */
  details: (name: string) => string;
  noResults: string;
  empty: string;
  loading: string;
}

const DEFAULT_LABELS: MetaTableLabels = {
  title: 'Meta',
  roleFilter: 'Role',
  allRoles: 'All',
  rank: 'Rank',
  search: 'Find a champion',
  position: '#',
  name: 'Champion',
  tier: 'Tier',
  winRate: 'Win rate',
  pickRate: 'Pick rate',
  banRate: 'Ban rate',
  games: 'Matches',
  interval: (low, high) => `95% interval ${low} to ${high}`,
  change: (signed) => `${signed} pts`,
  sinceLastPatch: 'since the last patch',
  lowSample: 'Few matches: the rates are rough',
  count: (shown, total) => (shown === total ? `${total} rows` : `${shown} of ${total} rows`),
  details: (name) => `Open ${name}`,
  noResults: 'Nothing matches the filters.',
  empty: 'No stats for this rank yet.',
  loading: 'Loading the stats',
};

export interface MetaTableProps extends Omit<ComponentPropsWithRef<'section'>, 'title' | 'children'> {
  /** Champions (or champion + role pairs) with their stats per rank. */
  entries: MetaTableEntry[];
  /** Ranks of the rank picker; the first is the default. */
  ranks: MetaRank[];
  /** Rank shown. */
  rank?: string;
  /** Initial rank when uncontrolled. Default: the first. */
  defaultRank?: string;
  /** Called when the reader picks a rank. */
  onRankChange?: (rank: string) => void;
  /** Roles of the entries: shown under the names and, with two or more, a role filter. */
  roles?: GameRole[];
  /** Role id the table is narrowed to; `''` shows every role. */
  roleFilter?: string;
  /** Initial role filter when uncontrolled. Default `''`. */
  defaultRoleFilter?: string;
  /** Called when the reader picks a role. */
  onRoleFilterChange?: (role: string) => void;
  /** Column and direction of the sort. */
  sort?: MetaTableSort;
  /** Initial sort when uncontrolled. Default tier, best first. */
  defaultSort?: MetaTableSort;
  /** Called when a column header is pressed. */
  onSortChange?: (sort: MetaTableSort) => void;
  /** Fewer matches than this: marked, and ranked after the rest by win rate and tier. Default 500. */
  minGames?: number;
  /** Tier column from best to worst, or `false` to hide it. Default S+ to D by win rate. */
  tiers?: MetaTier[] | false;
  /** Makes each champion name a button, e.g. to the champion's page. */
  onRowClick?: (entry: MetaTableEntry) => void;
  /** Most height of the scrolling body (px or CSS length); rows beyond it render only while in view. Default 560. */
  maxHeight?: number | string;
  /** Data is loading: skeleton rows. */
  loading?: boolean;
  /** Loading failed: shown instead of the table. */
  error?: ReactNode;
  /** Heading. Default: `labels.title`. */
  title?: ReactNode;
  /** Line under the heading: patch, period, source. */
  subtitle?: ReactNode;
  /** Level of the heading (default 3). */
  headingLevel?: 2 | 3 | 4 | 5;
  /** BCP 47 locale for numbers and sorting; defaults to the ThemeProvider's. */
  locale?: string;
  labels?: Partial<MetaTableLabels>;
  /** HearthPulse: draws a tier in place of the chip (the site's TierBadge). */
  renderTier?: (tier: MetaTier) => ReactNode;
  /** HearthPulse: false drops the ban-rate column for games without bans. Default true. */
  showBanRate?: boolean;
  /** HearthPulse: one more column after the matches, e.g. a sparkline; it joins the stats line on a narrow screen. */
  trendColumn?: { header: ReactNode; label: string; cell: (entry: MetaTableEntry) => ReactNode };
}

const ROW = 52;
const PORTRAIT = 36;

/**
 * The meta of a patch: champion with portrait and role, tier, win, pick and ban rates with their change since the
 * last patch, and matches, per rank. Columns sort, filters narrow by role, rank and name, thin samples are marked and
 * ranked last, long tables render only the rows in view, and on a narrow screen each row becomes a two-line card.
 */
export function MetaTable({
  entries,
  ranks,
  rank: rankProp,
  defaultRank,
  onRankChange,
  roles,
  roleFilter: roleFilterProp,
  defaultRoleFilter = '',
  onRoleFilterChange,
  sort: sortProp,
  defaultSort = { key: 'tier', direction: 'desc' },
  onSortChange,
  minGames = 500,
  tiers = DEFAULT_META_TIERS,
  onRowClick,
  maxHeight = 560,
  loading = false,
  error,
  title,
  subtitle,
  headingLevel = 3,
  locale: localeProp,
  labels,
  renderTier,
  showBanRate = true,
  trendColumn,
  className,
  ref,
  ...rest
}: MetaTableProps) {
  const locale = useLocale(localeProp);
  const copy = useLabels(DEFAULT_LABELS, labels);
  const uid = useId();
  const [rank, setRank] = useControllableState({ value: rankProp, defaultValue: defaultRank ?? ranks[0]?.id ?? '', onChange: onRankChange });
  const [roleFilterState, setRoleFilter] = useControllableState({ value: roleFilterProp, defaultValue: defaultRoleFilter, onChange: onRoleFilterChange });
  const [sort, setSort] = useControllableState<MetaTableSort>({ value: sortProp, defaultValue: defaultSort, onChange: onSortChange });
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const scrollRef = useRef<HTMLDivElement>(null);

  const roleById = useMemo(() => new Map((roles ?? []).map((r) => [r.id, r])), [roles]);
  const roleFilter = roleFilterState && roleById.has(roleFilterState) ? roleFilterState : '';
  const tierList = useMemo(() => tiers || [], [tiers]);
  /** Index of a row's tier in `tierList`: its explicit tier, else the first win-rate threshold it reaches. */
  const tierOf = useMemo(() => {
    const index = new Map(tierList.map((t, i) => [t.id, i]));
    return (row: MetaTableRow) => {
      if (!tierList.length) return -1;
      const explicit = row.stats.tier !== undefined ? index.get(row.stats.tier) : undefined;
      if (explicit !== undefined) return explicit;
      const found = tierList.findIndex((t) => t.minWinRate !== undefined && row.stats.winRate >= t.minWinRate);
      return found === -1 ? tierList.length - 1 : found;
    };
  }, [tierList]);

  const all = useMemo(() => metaTableRows(entries, rank, minGames), [entries, rank, minGames]);
  const rows = useMemo(() => {
    const words = deferredQuery.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
    const shown = all.filter((row) => {
      if (roleFilter && row.entry.role !== roleFilter) return false;
      if (!words.length) return true;
      const role = row.entry.role ? roleById.get(row.entry.role)?.label : '';
      const text = `${row.entry.name} ${role ?? ''}`.toLocaleLowerCase(locale);
      return words.every((w) => text.includes(w));
    });
    return sortMetaTable(shown, sort, locale, tierOf);
  }, [all, deferredQuery, sort, locale, roleFilter, roleById, tierOf]);

  const formats = useMemo(() => {
    const pct = new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const pts = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
    const int = new Intl.NumberFormat(locale);
    return { pct: (n: number) => pct.format(n), pts: (n: number) => pts.format(n * 100), int: (n: number) => int.format(n) };
  }, [locale]);

  const virtual = useVirtualizer({
    count: rows.length,
    scrollRef,
    estimateSize: ROW,
    getItemKey: (index) => rows[index]?.entry.id ?? index,
    overscan: 8,
    initialSize: 560,
  });
  const first = virtual.items[0];
  const last = virtual.items[virtual.items.length - 1];
  const top = first ? first.start : 0;
  const bottom = last ? Math.max(0, virtual.totalSize - last.end) : 0;

  const columns = ['40px minmax(180px, 2.2fr)', tiers && '56px', 'repeat(2, minmax(86px, 1fr))', showBanRate && 'minmax(86px, 1fr)', 'minmax(80px, 0.9fr)', trendColumn && 'minmax(112px, 1fr)']
    .filter(Boolean)
    .join(' ');

  const toggleSort = (key: MetaTableSortKey) =>
    setSort(sort.key === key ? { key, direction: sort.direction === 'desc' ? 'asc' : 'desc' } : { key, direction: key === 'name' ? 'asc' : 'desc' });

  const header = (key: MetaTableSortKey, text: string, cell: string) => {
    const active = sort.key === key;
    const Icon = !active ? ChevronsUpDownIcon : sort.direction === 'desc' ? ArrowDownIcon : ArrowUpIcon;
    return (
      <div role="columnheader" className={`ui-meta-table__cell ui-meta-table__${cell}`} aria-sort={active ? (sort.direction === 'desc' ? 'descending' : 'ascending') : undefined}>
        <button type="button" className="ui-meta-table__sort" data-active={active || undefined} onClick={() => toggleSort(key)}>
          {text}
          <Icon aria-hidden="true" />
        </button>
      </div>
    );
  };

  /** A rate with its change since the last patch under it. */
  const rate = (row: MetaTableRow, key: MetaRate, cell: string, caption: string) => {
    const value = row.stats[key];
    const delta = row.delta[key];
    const direction = delta === undefined || Math.abs(delta) < 0.0005 ? 'flat' : delta > 0 ? 'up' : 'down';
    return (
      <div role="cell" className={`ui-meta-table__cell ui-meta-table__${cell}`} data-label={caption}>
        {value === undefined ? (
          <span className="ui-meta-table__none">—</span>
        ) : (
          <span className="ui-meta-table__rate">
            <span className="ui-meta-table__value">{formats.pct(value)}</span>
            {delta !== undefined && (
              <span className="ui-meta-table__delta" data-direction={direction}>
                <TrendValue aria-hidden="true" value={Math.round(delta * 1000) / 10} fractionDigits={1} size="sm" locale={locale} direction={direction} />
                <span className="ui-sr-only">{`, ${copy.sinceLastPatch} ${copy.change(formats.pts(delta))}`}</span>
              </span>
            )}
            {key === 'winRate' && <span className="ui-sr-only">{`, ${copy.interval(formats.pct(row.interval[0]), formats.pct(row.interval[1]))}`}</span>}
          </span>
        )}
      </div>
    );
  };

  const renderRow = (row: MetaTableRow, index: number) => {
    const { entry, stats, lowSample } = row;
    const role = entry.role ? roleById.get(entry.role) : undefined;
    const t = tierOf(row);
    const tier = t >= 0 ? tierList[t] : undefined;
    return (
      <div
        key={entry.id}
        ref={virtual.measureElement}
        data-index={index}
        role="row"
        aria-rowindex={index + 2}
        className="ui-meta-table__row"
        data-low-sample={lowSample || undefined}
        data-clickable={onRowClick ? '' : undefined}
      >
        <div role="cell" className="ui-meta-table__cell ui-meta-table__position">
          {formats.int(index + 1)}
        </div>
        <div role="rowheader" className="ui-meta-table__cell ui-meta-table__who">
          <GameImage src={entry.image} name={entry.name} color={role?.color} size={PORTRAIT} />
          <span className="ui-meta-table__names">
            {onRowClick ? (
              <button type="button" className="ui-meta-table__name ui-meta-table__open" aria-label={copy.details(entry.name)} onClick={() => onRowClick(entry)}>
                {entry.name}
              </button>
            ) : (
              <span className="ui-meta-table__name">{entry.name}</span>
            )}
            {role && (
              <span className="ui-meta-table__role" style={{ '--_hue': gameToneColor(role.color ?? 'gray') } as CSSProperties}>
                {role.label}
              </span>
            )}
          </span>
        </div>
        {tiers && (
          <div role="cell" className="ui-meta-table__cell ui-meta-table__tier">
            {tier && renderTier ? renderTier(tier) : tier && (
              <span className="ui-game-tier" style={{ '--_tier': gameToneColor(tier.color ?? 'gray') } as CSSProperties}>
                {tier.label}
              </span>
            )}
          </div>
        )}
        {rate(row, 'winRate', 'win', copy.winRate)}
        {/* A layout box only: the cells inside stay cells of the row; on a narrow screen they wrap as one line. */}
        <div role="none" className="ui-meta-table__stats">
          {rate(row, 'pickRate', 'pick', copy.pickRate)}
          {showBanRate && rate(row, 'banRate', 'ban', copy.banRate)}
          <div role="cell" className="ui-meta-table__cell ui-meta-table__games" data-label={copy.games}>
            {lowSample && (
              <span className="ui-meta-table__low" title={copy.lowSample}>
                <InfoIcon aria-hidden="true" />
                <span className="ui-sr-only">{`${copy.lowSample}, `}</span>
              </span>
            )}
            <span className="ui-meta-table__value">{formats.int(stats.games)}</span>
          </div>
          {trendColumn && (
            <div role="cell" className="ui-meta-table__cell ui-meta-table__trend" data-label={trendColumn.label}>
              {trendColumn.cell(entry)}
            </div>
          )}
        </div>
      </div>
    );
  };

  let body: ReactNode;
  if (error) {
    body = (
      <div className="ui-meta-table__state" role="alert" data-state="error">
        <AlertCircleIcon aria-hidden="true" />
        <div>{error}</div>
      </div>
    );
  } else if (loading) {
    body = (
      <div className="ui-meta-table__state" data-state="loading">
        <span className="ui-sr-only" role="status">
          {copy.loading}
        </span>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} height={40} aria-hidden="true" />
        ))}
      </div>
    );
  } else if (all.length === 0) {
    body = <p className="ui-meta-table__state">{copy.empty}</p>;
  } else {
    body = (
      <div
        ref={scrollRef}
        className="ui-meta-table__scroll"
        tabIndex={0}
        role="region"
        aria-labelledby={`${uid}-title`}
        style={{ maxBlockSize: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
      >
        <div
          role="table"
          className="ui-meta-table__table"
          data-tiers={tiers ? '' : undefined}
          style={!showBanRate || trendColumn ? ({ '--_cols': columns } as CSSProperties) : undefined}
          aria-labelledby={`${uid}-title`}
          aria-rowcount={rows.length + 1}
          aria-describedby={`${uid}-count`}
        >
          <div role="rowgroup" className="ui-meta-table__head">
            <div role="row" aria-rowindex={1} className="ui-meta-table__row">
              <div role="columnheader" className="ui-meta-table__cell ui-meta-table__position">
                {copy.position}
              </div>
              {header('name', copy.name, 'who')}
              {tiers && header('tier', copy.tier, 'tier')}
              {header('winRate', copy.winRate, 'win')}
              {header('pickRate', copy.pickRate, 'pick')}
              {showBanRate && header('banRate', copy.banRate, 'ban')}
              {header('games', copy.games, 'games')}
              {trendColumn && (
                <div role="columnheader" className="ui-meta-table__cell ui-meta-table__trend">
                  {trendColumn.header}
                </div>
              )}
            </div>
          </div>
          <div role="rowgroup" className="ui-meta-table__body" style={{ paddingBlockStart: top, paddingBlockEnd: bottom }}>
            {virtual.items.map((item) => (rows[item.index] ? renderRow(rows[item.index], item.index) : null))}
          </div>
        </div>
        {rows.length === 0 && <p className="ui-meta-table__state">{copy.noResults}</p>}
      </div>
    );
  }

  const heading = createElement(`h${headingLevel}`, { className: 'ui-meta-table__title', id: `${uid}-title` }, title ?? copy.title);
  const ready = !loading && !error && all.length > 0;

  return (
    <section ref={ref} className={cx('ui-meta-table', 'ui-panel', className)} aria-labelledby={`${uid}-title`} aria-busy={loading || undefined} {...rest}>
      <header className="ui-meta-table__header">
        <div className="ui-meta-table__heading">
          {heading}
          {subtitle && <p className="ui-meta-table__subtitle">{subtitle}</p>}
        </div>
        {ranks.length > 1 && (
          <Select
            className="ui-meta-table__rank"
            size="sm"
            aria-label={copy.rank}
            value={rank}
            onValueChange={setRank}
            options={ranks.map((r) => ({ value: r.id, label: r.label }))}
          />
        )}
      </header>
      {(ready || (roles && roles.length > 1)) && (
        <div className="ui-meta-table__filters">
          {roles && roles.length > 1 && (
            <SegmentedControl
              size="sm"
              className="ui-meta-table__roles"
              aria-label={copy.roleFilter}
              value={roleFilter}
              onValueChange={setRoleFilter}
              options={roleFilterOptions(roles, copy.allRoles)}
            />
          )}
          {ready && <SearchInput className="ui-meta-table__search" size="sm" aria-label={copy.search} placeholder={copy.search} value={query} onValueChange={setQuery} />}
        </div>
      )}
      {body}
      {ready && (
        <p id={`${uid}-count`} className="ui-meta-table__count">
          {copy.count(rows.length, all.length)}
        </p>
      )}
    </section>
  );
}
