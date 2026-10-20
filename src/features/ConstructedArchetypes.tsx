import { useArchetypeDetail, useArchetypeCatalog, ArchetypeDetailSection } from '../modules/constructedArchetypes/public';
import { publicResourceImageUrl } from '../publicResourceUrl';
import { ArchetypesCatalogSkeleton } from './ArchetypesCatalogSkeleton';
import {
  ArchetypeAnalysisLoading, ArchetypeAnalysisReserve, ArchetypeBuildsSkeleton, ArchetypeHistorySkeleton, loadArchetypeAnalysis,
} from './ConstructedArchetypeDetailSkeletons';
import '../shared/ui/analytics/Analytics.css';
import { LineChart } from '../shared/ui/analytics/LineChart';
import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenText,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Gamepad2,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import '../route-parchment.css';
import '../shared/ui/LoadingSurface.css';
import './ConstructedArchetypes.css';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import type { ConstructedAnalysis } from './ConstructedArchetypeAnalysis';
import ConstructedArchetypeDeckGallery from './ConstructedArchetypeDeckGallery';
import {
  AsyncSurfaceState,
  RecoverableSurfaceBoundary,
} from './recovery/RecoverableSurface';
import { LoadingSurface } from '../shared/ui/LoadingSurface';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import {
  readInitialCatalogFilters,
  replaceCatalogUrl,
  type ArchetypeClass,
  type ArchetypeClassFilter,
  type ArchetypeFormat,
} from './constructedArchetypeCatalogUrl';

const ConstructedArchetypeAnalysis = React.lazy(loadArchetypeAnalysis);

type ArchetypeBuild = {
  deckCode: string;
  games: number | null;
  winrate: number | null;
  sourceUrl: string;
  updatedAt: string | null;
  classKey: ArchetypeClass | null;
  sampleRank: string;
  samplePeriod: string;
};

type ArchetypeItem = {
  slug: string;
  archetype: string;
  archetypeLabel: string;
  translated: boolean;
  classKey: ArchetypeClass | null;
  format: ArchetypeFormat;
  games: number;
  winrate: number | null;
  popularity: number | null;
  turns: number | null;
  durationMinutes: number | null;
  climbingSpeed: number | null;
  deckCount: number;
  builds: ArchetypeBuild[];
  sourceUrl: string;
};

export type ArchetypeCatalog = {
  format: ArchetypeFormat;
  formatLabel: string;
  patch: string;
  minimumGames: number;
  updatedAt: string | null;
  coverage: Record<string, unknown>;
  items: ArchetypeItem[];
};

type HistoryPoint = {
  recordedAt: string;
  games: number;
  winrate: number | null;
  popularity: number | null;
  turns: number | null;
  durationMinutes: number | null;
  climbingSpeed: number | null;
};

export type ArchetypeDetail = Omit<ArchetypeCatalog, 'coverage' | 'items'> & {
  item: ArchetypeItem;
  history: HistoryPoint[];
  analysis: ConstructedAnalysis | null;
  featuredBuild?: Pick<ArchetypeBuild, 'games' | 'winrate' | 'updatedAt' | 'sampleRank' | 'samplePeriod'> | null;
};

type SortKey = 'games' | 'winrate' | 'popularity' | 'decks' | 'name';

const FORMATS: Array<{ id: ArchetypeFormat; label: string; description: string; asset: string }> = [
  {
    id: 'standard',
    label: 'Стандарт',
    description: 'Карты текущей ротации',
    asset: '/card-format-standard.webp',
  },
  {
    id: 'wild',
    label: 'Вольный',
    description: 'Карты всех дополнений',
    asset: '/assets/card-format-wild-128.webp',
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

const ARCHETYPE_HERO_ART_OVERRIDES: Record<string, string> = {
  'void-soul-dh': '/archetype-art/void-soul-dh.webp',
};

function archetypeHeroArt(slug: string, analysis: ConstructedAnalysis | null): string | null {
  const override = ARCHETYPE_HERO_ART_OVERRIDES[slug];
  if (override) return override;

  const representativeCard = (analysis?.cardStats ?? []).reduce<(typeof analysis.cardStats)[number] | null>(
    (best, card) => (
      card.cardId && (!best || card.mulliganCount > best.mulliganCount) ? card : best
    ),
    null,
  );
  return representativeCard
    ? publicResourceImageUrl(representativeCard.fullArtwork || representativeCard.artwork, { width: 960, quality: 80 }) || null
    : null;
}


function classIcon(classKey: ArchetypeClass | null): string {
  return classKey ? `/class_icon/ui/${classKey}-64.webp` : '/class_icon/neutral.webp';
}

// toLocaleString with options builds an Intl.NumberFormat per call, three per
// catalog row on every render. Counts use 3 digits, toLocaleString's default.
const NUMBER_FORMATS = new Map<number, Intl.NumberFormat>();
function numberFormat(maximumFractionDigits: number): Intl.NumberFormat {
  const cached = NUMBER_FORMATS.get(maximumFractionDigits);
  if (cached) return cached;
  const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits });
  NUMBER_FORMATS.set(maximumFractionDigits, format);
  return format;
}

function formatNumber(value: number | null, suffix = '', maximumFractionDigits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${numberFormat(maximumFractionDigits).format(value)}${suffix}`;
}

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

function winrateTone(value: number | null): 'strong' | 'even' | 'weak' | 'neutral' {
  if (value === null) return 'neutral';
  if (value >= 52) return 'strong';
  if (value >= 49) return 'even';
  return 'weak';
}

function LoadingState({ detail = false }: { detail?: boolean }) {
  if (!detail) return <ArchetypesCatalogSkeleton />;
  return <LoadingSurface label="Загружаем архетип" quiet layout="rows"
    className="archetypes-loading archetypes-loading--detail" />;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <AsyncSurfaceState
      variant="error"
      title="Не удалось открыть архетипы"
      message={message}
      actionLabel="Повторить запрос"
      onAction={onRetry}
      className="archetypes-state"
    />
  );
}

function TrendChart({
  title,
  unit,
  points,
  value,
  color,
}: {
  title: string;
  unit: string;
  points: HistoryPoint[];
  value: (point: HistoryPoint) => number | null;
  color: string;
}) {
  return <LineChart title={title} subtitle={`${points.length} срезов · история архетипа`}
    unit={unit === '%' ? '%' : 'count'} color={color} domain={unit === '%' ? undefined : { minimum: 0 }}
    points={points.filter(point => Number.isFinite(Date.parse(point.recordedAt)))
      .map(point => ({ x: Date.parse(point.recordedAt), y: value(point), label: formatDate(point.recordedAt) }))
      .sort((a, b) => a.x - b.x)} />;
}

type ArchetypeCatalogProps = {
  navigatePath: (path: string) => void;
  initialSearch: string;
  embedded: boolean;
  /** Anonymous summary, shared by guests and subscribers. */
  initialCatalog: ArchetypeCatalog | null;
};

function ArchetypeCatalogPage({ navigatePath, initialSearch, embedded, initialCatalog }: ArchetypeCatalogProps) {
  const Root = embedded ? 'section' : 'main';
  const { format: initialFormat, classFilter: initialClass } = readInitialCatalogFilters(initialSearch, CLASS_FILTERS);
  const seed = initialCatalog?.format === initialFormat ? initialCatalog : null;
  const [format, setFormat] = useState<ArchetypeFormat>(initialFormat);
  const [classFilter, setClassFilter] = useState<ArchetypeClassFilter>(initialClass);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortKey>('games');
  const [arrivesLater] = useState(!seed);
  const { data: catalog, loading, error, retry } = useArchetypeCatalog(format, seed);

  const selectFormat = (next: ArchetypeFormat) => {
    setFormat(next);
    setQuery('');
    replaceCatalogUrl(next, classFilter);
  };

  const selectClass = (next: ArchetypeClassFilter) => {
    setClassFilter(next);
    replaceCatalogUrl(format, next);
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

  return (
    <Root className="archetypes-page" id={embedded ? undefined : 'main-content'} tabIndex={embedded ? undefined : -1}>
      <section className="traditional-mode-banner">
        <div className="traditional-mode-banner__copy">
          <h1>Архетипы</h1>
          <p>Актуальные архетипы, готовые сборки и история их результатов.</p>
        </div>
        <dl className="traditional-mode-banner__summary" aria-label="Сводка каталога">
          <div><dt>Архетипов</dt><dd>{catalog?.items.length ?? '—'}</dd></div>
          <div><dt>Игр в выборке</dt><dd>{totalGames ? numberFormat(3).format(totalGames) : '—'}</dd></div>
        </dl>
      </section>

      <nav className="archetypes-format-switch" aria-label="Формат Hearthstone" data-tour-id="archetypes-format">
        {FORMATS.map(item => (
          <button
            key={item.id}
            type="button"
            aria-pressed={format === item.id}
            onClick={() => selectFormat(item.id)}
          >
            <img src={item.asset} alt="" width="56" height="56" />
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
            {format === item.id && <Check size={18} aria-hidden="true" />}
          </button>
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
                aria-label={`${item.label}: ${count} архетипов`}
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
          <small>Патч {catalog?.patch || '—'} · минимум {catalog?.minimumGames ?? 50} игр · обновлено {formatDate(catalog?.updatedAt ?? null, timeZone)}</small>
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
            <span>{items.length} архетипов со сборками</span>
            <span>Нажмите на строку, чтобы открыть подробную страницу</span>
          </header>
          <div className="archetypes-list">
            {items.map((item, index) => (
              <article className="archetype-row" key={`${item.format}:${item.slug}`}>
                <span className="archetype-row__rank" aria-label={`Место ${index + 1}`}>{index + 1}</span>
                <img className="archetype-row__class" src={classIcon(item.classKey)} alt="" width="52" height="52" loading="lazy" />
                <div className="archetype-row__identity">
                  <span>{item.classKey ? CLASS_LABELS[item.classKey] : 'Смешанный класс'}</span>
                  <h2>{item.archetypeLabel}</h2>
                  {item.translated && <small>{item.archetype}</small>}
                </div>
                <dl className="archetype-row__metrics">
                  <div><dt>Винрейт</dt><dd className={`metric-${winrateTone(item.winrate)}`}>{formatNumber(item.winrate, '%')}</dd></div>
                  <div><dt>Популярность</dt><dd>{formatNumber(item.popularity, '%')}</dd></div>
                  <div><dt>Игры</dt><dd>{numberFormat(3).format(item.games)}</dd></div>
                  <div><dt>Сборки</dt><dd>{item.deckCount}</dd></div>
                </dl>
                <a
                  className="archetype-row__open"
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

type ArchetypeDetailProps = {
  format: ArchetypeFormat;
  slug: string;
  navigatePath: (path: string) => void;
  hasFullAccess: boolean;
  paywall: PaywallAccessState;
  initialDetail: ArchetypeDetail | null;
  embedded: boolean;
  accessPending: boolean;
};

function ArchetypeDetailPage({ format, slug, navigatePath, hasFullAccess, paywall, initialDetail, embedded, accessPending }: ArchetypeDetailProps) {
  const Root = embedded ? 'section' : 'main';
  const [visibleBuilds, setVisibleBuilds] = useState(6);
  const { detail, core, history: historyRead, analysis: analysisRead, fullAccess, denied } = useArchetypeDetail({
    format, slug, hasFullAccess, accessPending, seed: initialDetail,
  });
  // The analysis chunk loads beside the analysis request, so its placeholder and view are usually ready first.
  useEffect(() => { if (fullAccess && !accessPending) loadArchetypeAnalysis().catch(() => undefined); }, [fullAccess, accessPending]);
  const archetypeLabel = detail?.item.archetypeLabel;
  useEffect(() => {
    if (archetypeLabel) document.title = `${archetypeLabel} — сборки и статистика | Manacost Stats`;
  }, [archetypeLabel]);

  if (core.loading && !detail) {
    return <Root className="archetypes-page archetype-detail-page" id={embedded ? undefined : 'main-content'} tabIndex={embedded ? undefined : -1}><LoadingState detail /></Root>;
  }
  if (!detail) {
    return (
      <Root className="archetypes-page archetype-detail-page" id={embedded ? undefined : 'main-content'} tabIndex={embedded ? undefined : -1}>
        <button type="button" className="archetype-back" onClick={() => navigatePath('/standard/archetypes')}>
          <ArrowLeft size={18} /> Все архетипы
        </button>
        <ErrorState message={core.error || 'Архетип не найден'} onRetry={core.retry} />
      </Root>
    );
  }

  const { item, history } = detail;
  const mainBuild = item.builds[0] ?? null;
  const secondaryBuilds = item.builds.slice(1);
  const shownBuilds = secondaryBuilds.slice(0, visibleBuilds);
  const heroArt = archetypeHeroArt(item.slug, detail.analysis);

  return (
    <Root className="archetypes-page archetype-detail-page" id={embedded ? undefined : 'main-content'} tabIndex={embedded ? undefined : -1}>
      <nav className="archetype-breadcrumb" aria-label="Навигационная цепочка">
        <a href="/standard/archetypes/" onClick={event => { event.preventDefault(); navigatePath('/standard/archetypes/'); }}>
          <ArrowLeft size={17} /> Архетипы
        </a>
        <span aria-hidden="true">/</span>
        <span>{detail.formatLabel}</span>
        <span aria-hidden="true">/</span>
        <strong>{item.archetypeLabel}</strong>
      </nav>
      <section className="archetype-dossier" data-tour-id="archetype-summary">
        {heroArt ? (
          <img
            key={heroArt}
            className="archetype-dossier__art"
            onError={event => { event.currentTarget.hidden = true; }}
            src={heroArt}
            alt=""
            aria-hidden="true"
            decoding="async"
            fetchPriority="high"
          />
        ) : null}
        <div className="archetype-dossier__identity">
          <img src={classIcon(item.classKey)} alt="" width="92" height="92" />
          <h1>{item.archetypeLabel}</h1>
        </div>
        <dl className="archetype-dossier__metrics">
          <div><dt>Винрейт</dt><dd className={`metric-${winrateTone(item.winrate)}`}>{formatNumber(item.winrate, '%')}</dd></div>
          <div><dt>Популярность</dt><dd>{formatNumber(item.popularity, '%')}</dd></div>
          <div><dt>Игры</dt><dd>{item.games.toLocaleString('ru-RU')}</dd></div>
          <div><dt>Сборки</dt><dd>{item.deckCount}</dd></div>
          <div><dt>Средний матч</dt><dd>{formatNumber(item.durationMinutes, ' мин')}</dd></div>
          <div><dt>Средний ход</dt><dd>{formatNumber(item.turns)}</dd></div>
        </dl>
      </section>

      {fullAccess && (core.loading || core.error) ? (
        <ArchetypeDetailSection reserveViewport title="Сборки архетипа" loading={core.loading} error={core.error} onRetry={core.retry}
          skeleton={<ArchetypeBuildsSkeleton />} />
      ) : null}
      {denied ? <p role="alert">Доступ изменился. Обновите страницу, чтобы проверить подписку.</p> : null}

      {mainBuild && (
        <section className="archetype-main-build" data-tour-id="archetype-main-build">
          <header>
            <div>
              <span className="archetypes-eyebrow"><Sparkles size={14} /> Главная сборка</span>
              <h2>Самая большая подтверждённая выборка</h2>
            </div>
            <div className="archetype-main-build__sample">
              <strong>{formatNumber(mainBuild.winrate, '%')}</strong>
              <span>{mainBuild.games?.toLocaleString('ru-RU') ?? '—'} игр</span>
            </div>
          </header>
          <ConstructedArchetypeDeckGallery
            builds={[mainBuild]}
            format={item.format}
            archetype={item.archetype}
            classKey={item.classKey}
          />
          <footer>
            <span><Clock3 size={15} /> Выборка: последние 30 дней, все ранги</span>
            {mainBuild.sourceUrl && <a href={mainBuild.sourceUrl} target="_blank" rel="noreferrer">Открыть на HSGuru <ExternalLink size={15} /></a>}
          </footer>
        </section>
      )}

      {!fullAccess && detail.featuredBuild ? (
        <section className="archetype-build-preview" aria-labelledby="archetype-build-preview-title">
          <div>
            <span className="archetypes-eyebrow"><Sparkles size={14} /> Главная сборка</span>
            <h2 id="archetype-build-preview-title">Самая большая подтверждённая выборка</h2>
            <p>Состав и код колоды доступны подписчикам тарифа «Алмаз».</p>
          </div>
          <dl>
            <div><dt>Винрейт</dt><dd>{formatNumber(detail.featuredBuild.winrate, '%')}</dd></div>
            <div><dt>Игры</dt><dd>{detail.featuredBuild.games?.toLocaleString('ru-RU') ?? '—'}</dd></div>
          </dl>
        </section>
      ) : null}

      {!fullAccess ? (
        <PaywallGate
          active
          presentation="inline"
          surface="archetype"
          variant="standard"
          title="Колоды, матчапы и муллиган"
          {...paywall}
        />
      ) : null}

      {fullAccess && !core.loading ? (
        <ArchetypeDetailSection title="История архетипа" loading={historyRead.loading} error={historyRead.error} onRetry={historyRead.retry}
          skeleton={<ArchetypeHistorySkeleton />}>
        <section className="archetype-history" aria-labelledby="archetype-history-title" data-tour-id="archetype-history">
        <header className="archetype-section-heading">
          <div>
            <span className="archetypes-eyebrow"><TrendingUp size={15} /> Накопительная статистика</span>
            <h2 id="archetype-history-title">История архетипа</h2>
            <p>Новый срез добавляется каждые 12 часов. Через несколько дней здесь будет виден тренд, а через месяц — полноценная история меты.</p>
          </div>
          <span className="archetype-section-heading__count">{history.length} срезов</span>
        </header>
        <div className="archetype-history__charts">
          <TrendChart title="Винрейт" unit="%" points={history} value={point => point.winrate} color="#2f7a3e" />
          <TrendChart title="Популярность" unit="%" points={history} value={point => point.popularity} color="#8d171d" />
          <TrendChart title="Количество игр" unit="" points={history} value={point => point.games} color="#8a5b24" />
        </div>
        </section>
        </ArchetypeDetailSection>
      ) : null}

      {fullAccess && !core.loading ? <ArchetypeDetailSection title="Матчапы и муллиган" loading={analysisRead.loading}
        error={analysisRead.error} onRetry={analysisRead.retry} skeleton={<ArchetypeAnalysisLoading />}>
        <RecoverableSurfaceBoundary scope="constructed-archetype-analysis" title="Аналитика архетипа временно недоступна">
          <React.Suspense fallback={<ArchetypeAnalysisReserve />}>
            <ConstructedArchetypeAnalysis analysis={detail.analysis} />
          </React.Suspense>
        </RecoverableSurfaceBoundary>
      </ArchetypeDetailSection> : null}


      {fullAccess && secondaryBuilds.length > 0 && (
        <section className="archetype-builds" aria-labelledby="archetype-builds-title" data-tour-id="archetype-other-builds">
          <header className="archetype-section-heading">
            <div>
              <span className="archetypes-eyebrow"><Gamepad2 size={15} /> Сборки HSGuru</span>
              <h2 id="archetype-builds-title">Другие сборки архетипа</h2>
              <p>Сборки отсортированы по размеру выборки. Код можно скопировать и сразу импортировать в Hearthstone.</p>
            </div>
            <span className="archetype-section-heading__count">{secondaryBuilds.length} сборок</span>
          </header>
          <ConstructedArchetypeDeckGallery
            builds={shownBuilds}
            format={item.format}
            archetype={item.archetype}
            classKey={item.classKey}
          />
          {visibleBuilds < secondaryBuilds.length && (
            <button type="button" className="archetype-builds__more" onClick={() => setVisibleBuilds(value => value + 6)}>
              Показать ещё {Math.min(6, secondaryBuilds.length - visibleBuilds)}
              <ChevronDown size={17} />
            </button>
          )}
        </section>
      )}

      {!core.loading ? <section className="archetype-methodology">
        <BarChart3 size={24} aria-hidden="true" />
        <div>
          <h2>Как читать данные</h2>
          <p>Статистика архетипа относится к текущему патчу и учитывает архетипы от {detail.minimumGames} игр. Сборки используют выборку HSGuru за последние 30 дней, поэтому их показатели могут отличаться от общей статистики архетипа.</p>
        </div>
      </section> : null}
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
      />
    )
    : <ArchetypeCatalogPage navigatePath={navigatePath}
      initialSearch={initialSearch} embedded={embedded} initialCatalog={initialCatalog} />;
  return (
    <RecoverableSurfaceBoundary scope="constructed-archetypes">
      {content}
    </RecoverableSurfaceBoundary>
  );
}

export { DeckModal } from './StandardMetaDeckModal';
