import { useArchetypeCatalog } from '../modules/constructedArchetypes/public';
import { standardMetaPeriodLabel } from './standardMetaFilterModel';
import { isStandardMetaPeriod } from '../../shared/standardMetaPeriods';
import { ArchetypeDetailPage } from './ArchetypeDetailPage';
import {
  BUILDS_PENDING_MESSAGE, classIcon, ErrorState, formatNumber, LoadingState, numberFormat,
} from './archetypeDetailHelpers';
import type { OpenBuilds } from './archetypeOpenBuilds';
import type { PaidLock } from './ArchetypePaidFrames';
import '../shared/ui/analytics/Analytics.css';
import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpenText,
  Check,
  ChevronDown,
  Search,
} from 'lucide-react';
import '../route-parchment.css';
import '../shared/ui/LoadingSurface.css';
import './ConstructedArchetypes.css';
import { type PaywallAccessState } from '../components/PaywallGate';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import {
  AsyncSurfaceState,
  RecoverableSurfaceBoundary,
} from './recovery/RecoverableSurface';
import { pluralRu } from '../shared/text/pluralRu';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import { MODE_ORDER } from '../components/transitions/transitionOrder';
import { useListTransition } from '../components/transitions/useListTransition';
import {
  readInitialCatalogFilters,
  replaceCatalogUrl,
  type ArchetypeClass,
  type ArchetypeClassFilter,
  type ArchetypeFormat,
} from './constructedArchetypeCatalogUrl';

export type { ArchetypeCatalog, ArchetypeDetail } from './archetypeDetailTypes';
import type { ArchetypeCatalog, ArchetypeDetail } from './archetypeDetailTypes';

type SortKey = 'games' | 'winrate' | 'popularity' | 'decks' | 'name';

/** Each format's catalog has its own address (`/standard/archetypes/wild/` for Wild), so the switch is two links. */
const FORMATS: Array<{ id: ArchetypeFormat; label: string; description: string; asset: string; href: string }> = [
  {
    id: 'standard',
    label: 'Стандарт',
    description: 'Карты текущей ротации',
    asset: '/card-format-standard.webp',
    href: '/standard/archetypes/',
  },
  {
    id: 'wild',
    label: 'Вольный',
    description: 'Карты всех дополнений',
    asset: '/assets/card-format-wild-128.webp',
    href: '/standard/archetypes/wild/',
  },
];

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'games', label: 'По числу игр' },
  { id: 'winrate', label: 'По винрейту' },
  { id: 'popularity', label: 'По популярности' },
  { id: 'decks', label: 'По числу сборок' },
  { id: 'name', label: 'По названию' },
];

const DEFAULT_PAYWALL_ACCESS: PaywallAccessState = {
  authUser: null,
  subscriptionStatus: null,
  subscriptionLoading: false,
  onRefreshSubscription: async () => null,
};

const CLASS_LABELS: Record<ArchetypeClass, string> = {
  deathknight: 'Рыцарь смерти',
  demonhunter: 'Охотник на демонов',
  druid: 'Друид',
  hunter: 'Охотник',
  mage: 'Маг',
  paladin: 'Паладин',
  priest: 'Жрец',
  rogue: 'Разбойник',
  shaman: 'Шаман',
  warlock: 'Чернокнижник',
  warrior: 'Воин',
};

const CLASS_FILTERS: Array<{ id: ArchetypeClassFilter; label: string; asset: string }> = [
  { id: 'all', label: 'Все классы', asset: '/class_icon/ui/all-96.webp' },
  ...Object.entries(CLASS_LABELS).map(([id, label]) => ({
    id: id as ArchetypeClass,
    label,
    asset: `/class_icon/ui/${id}-64.webp`,
  })),
];

function formatDate(value: string | null, timeZone?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Нет данных';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
}

/** «Баны», «Тёмная империя» or «Патч 36.6.3»: the HSGuru period the catalog's games come from. */
function catalogPeriodLabel(catalog: Pick<ArchetypeCatalog, 'period' | 'patch'> | null): string {
  if (catalog?.period) return standardMetaPeriodLabel(catalog.period);
  // The detail answer names its window only in `patch` (`black_empire_ban`, or `36.6.3` for a patch).
  if (catalog?.patch && isStandardMetaPeriod(catalog.patch)) return standardMetaPeriodLabel(catalog.patch);
  return `Патч ${catalog?.patch || '—'}`;
}

function winrateTone(value: number | null): 'strong' | 'even' | 'weak' | 'neutral' {
  if (value === null) return 'neutral';
  if (value >= 52) return 'strong';
  if (value >= 49) return 'even';
  return 'weak';
}

type ArchetypeCatalogProps = {
  navigatePath: (path: string) => void;
  initialSearch: string;
  embedded: boolean;
  /** Anonymous summary, shared by guests and subscribers. */
  initialCatalog: ArchetypeCatalog | null;
  /** The format the path names (`/standard/archetypes/wild/`); without it the query's (`?format=wild`) or Standard. */
  pathFormat?: ArchetypeFormat;
};

function ArchetypeCatalogPage({ navigatePath, initialSearch, embedded, initialCatalog, pathFormat }: ArchetypeCatalogProps) {
  const Root = embedded ? 'section' : 'main';
  const filters = readInitialCatalogFilters(initialSearch, CLASS_FILTERS);
  const format = pathFormat ?? filters.format;
  const seed = initialCatalog?.format === format ? initialCatalog : null;
  const [classFilter, setClassFilter] = useState<ArchetypeClassFilter>(filters.classFilter);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortKey>('games');
  const [arrivesLater] = useState(!seed);
  const { data: catalog, loading, error, retry } = useArchetypeCatalog(format, seed);

  const selectClass = (next: ArchetypeClassFilter) => {
    setClassFilter(next);
    replaceCatalogUrl(format, next, pathFormat === 'wild');
  };

  const items = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase('ru-RU');
    const filtered = (catalog?.items ?? []).filter(item => (
      (classFilter === 'all' || item.classKey === classFilter)
      && (!normalized || `${item.archetype} ${item.archetypeLabel}`.toLocaleLowerCase('ru-RU').includes(normalized))
    ));
    return [...filtered].sort((left, right) => {
      if (sort === 'name') return left.archetypeLabel.localeCompare(right.archetypeLabel, 'ru');
      const leftValue = sort === 'decks' ? left.deckCount : left[sort];
      const rightValue = sort === 'decks' ? right.deckCount : right[sort];
      return Number(rightValue ?? -Infinity) - Number(leftValue ?? -Infinity);
    });
  }, [catalog?.items, classFilter, deferredQuery, sort]);

  const classCounts = useMemo(() => {
    const counts = new Map<ArchetypeClass, number>();
    for (const item of catalog?.items ?? []) {
      if (item.classKey) counts.set(item.classKey, (counts.get(item.classKey) ?? 0) + 1);
    }
    return counts;
  }, [catalog?.items]);

  const totalGames = catalog?.items.reduce((sum, item) => sum + item.games, 0) ?? 0;
  const activeClassLabel = CLASS_FILTERS.find(item => item.id === classFilter)?.label ?? 'Все классы';
  const timeZone = useViewerTimeZone();
  // A class or search filter moves the rows; a mode's catalog arriving slides its rows in towards the chosen mode.
  const listRef = useListTransition<HTMLDivElement>(items, undefined, { key: catalog?.format ?? format, order: MODE_ORDER });

  return (
    <Root className="archetypes-page" id={embedded ? undefined : 'main-content'} tabIndex={embedded ? undefined : -1}>
      <section className="traditional-mode-banner">
        <div className="traditional-mode-banner__copy">
          <h1>{pathFormat === 'wild' ? 'Архетипы Вольного формата' : 'Архетипы'}</h1>
        </div>
        <dl className="traditional-mode-banner__summary" aria-label="Сводка каталога">
          <div><dt>Архетипов</dt><dd>{catalog?.items.length ?? '—'}</dd></div>
          <div><dt>Игр в выборке</dt><dd>{totalGames ? numberFormat(3).format(totalGames) : '—'}</dd></div>
        </dl>
      </section>

      <nav className="archetypes-format-switch" aria-label="Формат Hearthstone" data-tour-id="archetypes-format">
        {FORMATS.map(item => (
          <a key={item.id} href={`${item.href}${classFilter === 'all' ? '' : `?class=${classFilter}`}`}
            aria-current={format === item.id ? 'page' : undefined}>
            <img src={item.asset} alt="" width="56" height="56" />
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
            {format === item.id && <Check size={18} aria-hidden="true" />}
          </a>
        ))}
      </nav>

      <section
        className="archetypes-class-filter"
        aria-labelledby="archetypes-class-filter-title"
        data-tour-id="archetypes-class-filter"
      >
        <header>
          <span id="archetypes-class-filter-title">Класс</span>
          <strong>{activeClassLabel}</strong>
        </header>
        <fieldset className="archetypes-class-filter__scroller">
          <legend className="sr-only">Фильтр архетипов по классу</legend>
          {CLASS_FILTERS.map(item => {
            const count = item.id === 'all'
              ? catalog?.items.length ?? 0
              : classCounts.get(item.id) ?? 0;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`${item.label}: ${count} ${pluralRu(count, 'архетип', 'архетипа', 'архетипов')}`}
                aria-pressed={classFilter === item.id}
                title={item.label}
                onClick={() => selectClass(item.id)}
              >
                <img src={item.asset} alt="" width="48" height="48" />
              </button>
            );
          })}
        </fieldset>
      </section>

      <section className="archetypes-tools" aria-label="Поиск и сортировка">
        <div>
          <span className="archetypes-eyebrow"><BookOpenText size={14} /> Каталог</span>
          <strong>{catalog?.formatLabel ?? (format === 'standard' ? 'Стандарт' : 'Вольный')}</strong>
          <small>{catalogPeriodLabel(catalog)} · минимум {catalog?.minimumGames ?? 50} игр · обновлено {formatDate(catalog?.updatedAt ?? null, timeZone)} · данные HSGuru</small>
        </div>
        <label className="archetypes-search" data-tour-id="archetypes-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Найти архетип</span>
          <input value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="Найти архетип..." />
        </label>
        <label className="archetypes-sort" data-tour-id="archetypes-sort">
          <span className="sr-only">Сортировка</span>
          <select value={sort} onChange={event => setSort(event.target.value as SortKey)}>
            {SORTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <ChevronDown size={17} aria-hidden="true" />
        </label>
      </section>

      {loading && !catalog && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && items.length === 0 && (
        <AsyncSurfaceState
          variant="empty"
          title="Архетипы не найдены"
          message="Попробуйте изменить запрос, класс или выбрать другой формат."
          actionLabel="Сбросить фильтры"
          onAction={() => {
            setQuery('');
            selectClass('all');
          }}
          className="archetypes-state"
        />
      )}
      {(!loading || catalog) && !error && items.length > 0 && (
        <section className={`archetypes-ledger data-surface${arrivesLater ? ' data-arrive' : ''}`} aria-label={`Архетипы: ${catalog?.formatLabel}`} aria-busy={loading}>
          <header className="archetypes-ledger__header" data-tour-id="archetypes-results">
            <span>{items.length} {pluralRu(items.length, 'архетип', 'архетипа', 'архетипов')}</span>
            <span>Нажмите на строку, чтобы открыть подробную страницу</span>
          </header>
          <div className="archetypes-list" ref={listRef}>
            {items.map((item, index) => (
              <article className="archetype-row" key={`${item.format}:${item.slug}`}>
                <span className="archetype-row__rank" aria-label={`Место ${index + 1}`}>{index + 1}</span>
                <img className="archetype-row__class" src={classIcon(item.classKey)} alt="" width="52" height="52" loading="lazy" />
                <div className="archetype-row__identity">
                  <span>{item.classKey ? CLASS_LABELS[item.classKey] : 'Смешанный класс'}</span>
                  <h2>{item.archetypeLabel}</h2>
                  {item.translated && <small>{item.archetype}</small>}
                  {item.deckCount === 0 && <small className="archetype-row__pending">{BUILDS_PENDING_MESSAGE}</small>}
                </div>
                <dl className="archetype-row__metrics">
                  <div><dt>Винрейт</dt><dd className={`metric-${winrateTone(item.winrate)}`}>{formatNumber(item.winrate, '%')}</dd></div>
                  <div><dt>Популярность</dt><dd>{formatNumber(item.popularity, '%')}</dd></div>
                  <div><dt>Игры</dt><dd>{numberFormat(3).format(item.games)}</dd></div>
                  <div><dt>Сборки</dt><dd>{item.deckCount}</dd></div>
                </dl>
                <a
                  className="archetype-row__open"
                  aria-label={`Открыть страницу архетипа: ${item.archetypeLabel}`}
                  href={canonicalPagePath(`/standard/archetypes/${item.format}/${item.slug}`)}
                  onClick={event => {
                    event.preventDefault();
                    navigatePath(canonicalPagePath(`/standard/archetypes/${item.format}/${item.slug}`));
                  }}
                >
                  <span>Открыть</span>
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        </section>
      )}
    </Root>
  );
}

export default function ConstructedArchetypes({
  currentPath = typeof window === 'undefined' ? '/standard/archetypes/' : window.location.pathname,
  navigatePath = path => window.location.assign(path),
  initialSearch = typeof window === 'undefined' ? '' : window.location.search,
  initialDetail = null,
  initialCatalog = null,
  embedded = false,
  hasFullAccess = true,
  accessPending = false,
  paywall = DEFAULT_PAYWALL_ACCESS,
  openLayer = false,
  openBuilds,
  paidLock,
}: {
  currentPath?: string;
  navigatePath?: (path: string) => void;
  initialSearch?: string;
  initialDetail?: ArchetypeDetail | null;
  initialCatalog?: ArchetypeCatalog | null;
  embedded?: boolean;
  hasFullAccess?: boolean;
  accessPending?: boolean;
  paywall?: PaywallAccessState;
  openLayer?: boolean;
  openBuilds?: OpenBuilds;
  paidLock?: PaidLock;
}) {
  const detailMatch = currentPath.match(/^\/standard\/(?:archetypes|meta)\/(standard|wild)\/([a-z0-9-]+)\/?$/);
  const content = detailMatch
    ? (
      <ArchetypeDetailPage
        format={detailMatch[1] as ArchetypeFormat}
        slug={detailMatch[2]}
        navigatePath={navigatePath}
        hasFullAccess={hasFullAccess}
        paywall={paywall}
        initialDetail={initialDetail}
        accessPending={accessPending}
        embedded={embedded}
        openLayer={openLayer}
        openBuilds={openBuilds}
        paidLock={paidLock}
      />
    )
    : <ArchetypeCatalogPage navigatePath={navigatePath} initialSearch={initialSearch} embedded={embedded}
      initialCatalog={initialCatalog} pathFormat={/^\/standard\/archetypes\/wild\/?$/.test(currentPath) ? 'wild' : undefined} />;
  return (
    <RecoverableSurfaceBoundary scope="constructed-archetypes">
      {content}
    </RecoverableSurfaceBoundary>
  );
}

export { DeckModal } from './StandardMetaDeckModal';
