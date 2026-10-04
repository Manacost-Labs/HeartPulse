import { constructedCardRoute as routeState } from '../modules/constructedCards/public';
import { useCatalogLocation, useCatalogData, useCatalogIntentWarm, catalogLocationUrl, type CardCatalogPayload } from '../modules/constructedCards/public';
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  List,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import './StandardCards.styles';
import { publicResourceUrl } from '../publicResourceUrl';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import { prefetchConstructedCardDetail } from './constructedCardDetailPrefetch';
import ConstructedCardCatalogSearch from './ConstructedCardCatalogSearch';
import ConstructedCardDownloadButton from './ConstructedCardDownloadButton';
import ConstructedCardGalleryImage, { useCardGalleryImageLoading } from './ConstructedCardGalleryImage';
import { CARD_GALLERY_HIGH_PRIORITY_COUNT } from './cardGalleryImageLoading';
import FilterSelect from './ConstructedCardFilterSelect';
import {
  loadConstructedCardList,
  prefetchConstructedCardList,
} from './constructedCardListPrefetch';
export { prefetchInitialConstructedCardCatalog } from './constructedCardListPrefetch';
import { type ConstructedCardCatalogFilters as Filters } from './constructedCardCatalogModel';
import { compareConstructedSets, constructedSetLabel } from './constructedCardLabels';
import {
  classFilterOptions,
  constructedClassIcon as classIcon,
  constructedClassLabel as classLabel,
  constructedTypeLabel,
  numericFilterOptions,
  rarityFilterOptions,
  setFilterOptions,
  statisticSortOptions,
  textFilterOptions,
} from './constructedCardFilterOptions';
import {
  constructedCardDataNotice,
  constructedCardRequestError,
} from './constructedCardRequestState';
import {
  CONSTRUCTED_CARD_RANK_OPTIONS,
  constructedCardPeriodLabel,
  constructedCardPeriodOptions,
  constructedCardRankLabel,
  constructedCardStatsUrl,
  type ConstructedCardPeriod,
  type ConstructedCardRank,
} from './constructedCardPeriods';
import { constructedCardImage } from './constructedCardMedia';
import { loadDeckView } from './hsReplayDeckViewRuntime';
import { isPublicConstructedTerm } from '../../shared/constructedCardTranslations';
import {
  cardName,
  cardPath,
  mechanicLabel,
  navigateWithConstructedCardContext,
  number,
  percent,
  type CardFormat,
  type CardRecord,
  type StandardCardsProps,
} from './constructedCardRecord';
import { LOCKED_STATS_PLACEHOLDER, StatsRows, StatsUnlockNotice, type StatsGateProps } from './ConstructedCardStats';

type ViewMode = 'gallery' | 'table';

type ConstructedCardPeriodDescriptor = {
  id: ConstructedCardPeriod;
  label: string;
  timeRange: string | null;
  patch: string | null;
};

type Facets = {
  classes: string[];
  sets: string[];
  mechanics: string[];
  types: string[];
  rarities: string[];
};

type ListPayload = CardCatalogPayload<CardRecord>;

const EMPTY_FACETS: Facets = { classes: [], sets: [], mechanics: [], types: [], rarities: [] };

const STATISTIC_SORTS = new Set(['popularity', 'winrate', 'games']);

const warmedCardImages = new Set<string>();

function preloadImage(url: string | null | undefined): void {
  const source = String(url ?? '').trim();
  if (!source || typeof Image === 'undefined' || warmedCardImages.has(source)) return;
  warmedCardImages.add(source);
  const image = new Image();
  image.decoding = 'async';
  image.onerror = () => warmedCardImages.delete(source);
  image.src = source;
}

function sortMetric(card: CardRecord, sort: string): { label: string; value: string } {
  if (sort === 'winrate') return { label: 'Победы колод', value: percent(card.stats?.deckWinrate) };
  if (sort === 'games') return { label: 'Сыграно партий', value: number(card.stats?.timesPlayed) };
  if (sort === 'mana') return { label: 'Мана', value: number(card.mana_cost) };
  if (sort === 'attack') return { label: 'Атака', value: number(card.attack) };
  if (sort === 'health') return { label: 'Здоровье', value: number(card.health) };
  if (sort === 'set') return { label: 'Дополнение', value: card.card_set ? constructedSetLabel(card.card_set) : 'Нет данных' };
  if (sort === 'class') return { label: 'Класс', value: classLabel(card.class || 'NEUTRAL') };
  if (sort === 'mechanics') {
    const count = cardMechanicKeys(card).length;
    return { label: 'Механики', value: count ? number(count) : 'Нет данных' };
  }
  if (sort === 'name') return { label: 'Название', value: card.name?.en || cardName(card) };
  return { label: 'В % колод', value: percent(card.stats?.deckPopularity) };
}

function cardMechanicKeys(card: CardRecord): string[] {
  return [...new Set([...(card.mechanics || []), ...(card.referenced_tags || [])]
    .map(value => String(value).trim())
    .filter(isPublicConstructedTerm))];
}

function LockedStatValue() {
  return (
    <span className="constructed-cards__locked-value" aria-label="Доступно с тарифом Алмаз">
      <span aria-hidden="true">18,7%</span><LockKeyhole size={13} aria-hidden="true" />
    </span>
  );
}

function HoverTooltip({ card, rect, rankLabel, statsAccess, gate }: { card: CardRecord; rect: DOMRect; rankLabel: string; statsAccess: boolean; gate: StatsGateProps }) {
  const width = 320;
  const left = rect.right + width + 18 <= window.innerWidth ? rect.right + 10 : Math.max(10, rect.left - width - 10);
  const top = Math.max(10, Math.min(rect.top + rect.height * 0.12, window.innerHeight - 390));
  return (
    <aside className="constructed-cards__tooltip" style={{ left, top, width }} role="tooltip">
      <div className="constructed-cards__tooltip-header"><strong>{cardName(card)}</strong><span>Статистика · {rankLabel}</span></div>
      {statsAccess ? <StatsRows stats={card.stats} compact /> : (
        <div className="constructed-cards__stats-locked-preview">
          <div aria-hidden="true" inert><StatsRows stats={LOCKED_STATS_PLACEHOLDER} compact /></div>
          <StatsUnlockNotice {...gate} compact />
        </div>
      )}
    </aside>
  );
}

function CardGallery({ cards, search, format, period, rank, sort, navigatePath, statsAccess, gate }: { cards: CardRecord[]; search: string; format: CardFormat; period: ConstructedCardPeriod; rank: ConstructedCardRank; sort: string; navigatePath: (path: string) => void; statsAccess: boolean; gate: StatsGateProps }) {
  const [hovered, setHovered] = useState<{ card: CardRecord; rect: DOMRect } | null>(null);
  const prefetchTimer = useRef<number | null>(null);
  const { galleryRef, immediateImageCount } = useCardGalleryImageLoading(cards);
  const showTooltip = (card: CardRecord, element: HTMLElement) => setHovered({ card, rect: element.getBoundingClientRect() });
  const warmCard = (card: CardRecord, fullImage: string | null) => {
    preloadImage(fullImage);
    prefetchConstructedCardDetail({
      cardId: card.card_id,
      format,
      statsFormat: format,
      period,
      rank,
      statsAccess,
    });
  };
  const scheduleWarmCard = (card: CardRecord, fullImage: string | null) => {
    if (prefetchTimer.current !== null) window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = window.setTimeout(() => warmCard(card, fullImage), 120);
  };
  const cancelWarmCard = () => {
    if (prefetchTimer.current !== null) window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  };
  useEffect(() => cancelWarmCard, []);
  return (
    <>
      <div className="constructed-cards__gallery" ref={galleryRef}>
        {cards.map((card, index) => {
          const metric = sortMetric(card, sort);
          const name = cardName(card);
          const fullImage = constructedCardImage(card);
          return (
            <article
              key={card.card_id}
              className="constructed-cards__gallery-card"
              data-rarity={String(card.rarity || 'COMMON').toLowerCase()}
            >
              <a
                href={constructedCardStatsUrl(cardPath(format, card), { period, rank, statsFormat: format, defaultStatsFormat: format }, search)}
                className="constructed-cards__gallery-card-link"
                onMouseEnter={event => {
                  showTooltip(card, event.currentTarget);
                  scheduleWarmCard(card, fullImage);
                }}
                onMouseLeave={() => {
                  setHovered(null);
                  cancelWarmCard();
                }}
                onPointerDown={() => warmCard(card, fullImage)}
                onFocus={event => {
                  showTooltip(card, event.currentTarget);
                  warmCard(card, fullImage);
                }}
                onBlur={() => setHovered(null)}
                onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); navigateWithConstructedCardContext(navigatePath, cardPath(format, card), period, rank, format, format); }}
              >
                <ConstructedCardGalleryImage src={constructedCardImage(card, 'thumb') || '/arena-logo-icon.webp?v=arena-legacy-20260629'} alt={name} immediate={index < immediateImageCount} highPriority={index < CARD_GALLERY_HIGH_PRIORITY_COUNT} />
                <span className="constructed-cards__gallery-name">{name}</span>
                <span className="constructed-cards__gallery-stat" data-tour-id={index === 0 ? 'cards-statistics' : undefined}><small>{metric.label}</small>{!statsAccess && STATISTIC_SORTS.has(sort) ? <LockedStatValue /> : <strong>{metric.value}</strong>}</span>
              </a>
              {fullImage && <ConstructedCardDownloadButton cardId={card.card_id} cardName={name} href={fullImage} />}
            </article>
          );
        })}
      </div>
      {hovered && <HoverTooltip card={hovered.card} rect={hovered.rect} rankLabel={constructedCardRankLabel(rank)} statsAccess={statsAccess} gate={gate} />}
    </>
  );
}

function HsReplayDataDeckCard({ card }: { card: CardRecord }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dbfIds = card.dbf === null || card.dbf === undefined ? '' : String(card.dbf);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let cancelled = false;
    let rendered = false;
    // The card name stays as the cell's text until the renderer arrives, or
    // for good when its chunk cannot load.
    void loadDeckView().then(api => {
      if (cancelled) return;
      api.renderDeck(container, [{
        id: card.card_id,
        dbfId: card.dbf,
        name: cardName(card),
        cost: card.mana_cost ?? 0,
        rarity: card.rarity || 'COMMON',
        elite: String(card.rarity || '').toUpperCase() === 'LEGENDARY',
        count: 1,
        image: publicResourceUrl(card.images?.crop)
          || `/api/public-resource/hsjson/v1/tiles/${encodeURIComponent(card.card_id)}.webp`,
      }], {
        className: 'constructed-cards__hsrdv',
        group: false,
        sort: false,
        clear: true,
        showSingleCountBox: false,
      });
      rendered = true;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      if (rendered) container.replaceChildren();
    };
  }, [card]);
  return <div ref={containerRef} className="constructed-cards__data-deck-card" data-deck-cards={dbfIds} data-card-id={card.card_id}><span>{cardName(card)}</span></div>;
}

function sortAria(sort: string, column: string, direction: Filters['direction']): React.AriaAttributes['aria-sort'] {
  if (sort !== column) return undefined;
  return direction === 'asc' ? 'ascending' : 'descending';
}

function CardTable({ cards, search, format, period, rank, sort, direction, navigatePath, statsAccess }: { cards: CardRecord[]; search: string; format: CardFormat; period: ConstructedCardPeriod; rank: ConstructedCardRank; sort: string; direction: Filters['direction']; navigatePath: (path: string) => void; statsAccess: boolean }) {
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const prefetchTimer = useRef<number | null>(null);
  const showPreview = (card: CardRecord, element: HTMLElement) => setPreview({
    id: card.card_id,
    name: cardName(card),
    imageUrl: constructedCardImage(card),
    rect: element.getBoundingClientRect(),
  });
  const warmCard = (card: CardRecord) => {
    preloadImage(constructedCardImage(card));
    prefetchConstructedCardDetail({
      cardId: card.card_id,
      format,
      statsFormat: format,
      period,
      rank,
      statsAccess,
    });
  };
  const scheduleWarmCard = (card: CardRecord) => {
    if (prefetchTimer.current !== null) window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = window.setTimeout(() => warmCard(card), 120);
  };
  const cancelWarmCard = () => {
    if (prefetchTimer.current !== null) window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  };
  useEffect(() => cancelWarmCard, []);
  return (
    <>
      <div className="constructed-cards__table-wrap">
        <table className="constructed-cards__table">
          <thead><tr><th aria-sort={sortAria(sort, 'name', direction)}>Карта</th><th aria-sort={sortAria(sort, 'class', direction)}>Класс</th><th aria-sort={sortAria(sort, 'set', direction)}>Дополнение</th><th aria-sort={sortAria(sort, 'mana', direction)}>Мана</th><th aria-sort={sortAria(sort, 'attack', direction)}>Атака</th><th aria-sort={sortAria(sort, 'health', direction)}>Здоровье</th><th aria-sort={sortAria(sort, 'popularity', direction)}>В % колод {!statsAccess && <LockKeyhole size={12} aria-label="Тариф Алмаз" />}</th><th aria-sort={sortAria(sort, 'winrate', direction)}>Победы колод {!statsAccess && <LockKeyhole size={12} aria-label="Тариф Алмаз" />}</th><th aria-sort={sortAria(sort, 'games', direction)}>Партий {!statsAccess && <LockKeyhole size={12} aria-label="Тариф Алмаз" />}</th></tr></thead>
          <tbody>
            {cards.map((card, index) => (
              <tr key={card.card_id}>
                <th scope="row"><a
                  href={constructedCardStatsUrl(cardPath(format, card), { period, rank, statsFormat: format, defaultStatsFormat: format }, search)}
                  aria-label={`Открыть карту ${cardName(card)}`}
                  onMouseEnter={event => {
                    showPreview(card, event.currentTarget);
                    scheduleWarmCard(card);
                  }}
                  onMouseLeave={() => {
                    setPreview(null);
                    cancelWarmCard();
                  }}
                  onPointerDown={() => warmCard(card)}
                  onFocus={event => {
                    showPreview(card, event.currentTarget);
                    warmCard(card);
                  }}
                  onBlur={() => setPreview(null)}
                  onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); navigateWithConstructedCardContext(navigatePath, cardPath(format, card), period, rank, format, format); }}
                ><HsReplayDataDeckCard card={card} /></a></th>
                <td data-label="Класс"><span><img className="constructed-cards__class-icon" src={classIcon(card.class)} alt="" />{classLabel(card.class || 'NEUTRAL')}</span></td>
                <td data-label="Дополнение">{card.card_set ? constructedSetLabel(card.card_set) : '—'}</td><td data-label="Мана">{number(card.mana_cost)}</td><td data-label="Атака">{number(card.attack)}</td><td data-label="Здоровье">{number(card.health)}</td>
                <td data-label="В % колод" data-tour-id={index === 0 ? 'cards-statistics' : undefined}>{statsAccess ? percent(card.stats?.deckPopularity) : <LockedStatValue />}</td><td data-label="Победы колод">{statsAccess ? percent(card.stats?.deckWinrate) : <LockedStatValue />}</td><td data-label="Партий">{statsAccess ? number(card.stats?.timesPlayed) : <LockedStatValue />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview && <CardPreviewTooltip preview={preview} />}
    </>
  );
}

function Pagination({ page, totalPages, total, perPage, onPage }: { page: number; totalPages: number; total: number; perPage: number; onPage: (page: number) => void }) {
  if (total <= 0) return null;
  const pages = [...new Set([1, Math.max(1, page - 1), page, Math.min(totalPages, page + 1), totalPages])].sort((a, b) => a - b);
  return (
    <nav className="constructed-cards__pagination" aria-label="Страницы библиотеки">
      <span className="constructed-cards__page-summary">Страница {page} из {totalPages} · по {perPage} · всего {number(total)}</span>
      {totalPages > 1 && <>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={17} /> Назад</button>
        {pages.map((item, index) => <React.Fragment key={item}>{index > 0 && item - pages[index - 1] > 1 && <span>…</span>}<button type="button" aria-current={item === page ? 'page' : undefined} onClick={() => onPage(item)}>{item}</button></React.Fragment>)}
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Вперёд <ChevronRight size={17} /></button>
      </>}
    </nav>
  );
}

function CardsListPage({ initialFormat, initialCatalog, initialSearch, navigatePath, statsAccess, statsAccessLoading, authUser, onRefreshSubscription }: Pick<StandardCardsProps, 'initialCatalog' | 'initialSearch' | 'navigatePath' | 'statsAccess' | 'statsAccessLoading' | 'authUser' | 'onRefreshSubscription'> & { initialFormat: CardFormat }) {
  const { state, update, updateFilter, reset, clearSearch } = useCatalogLocation(initialFormat, initialSearch);
  const { format, period, rank, view, filters, perPage } = state;
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { data, loading, error: failure, requestQuery, retry } = useCatalogData<ListPayload>({ state, seed: initialCatalog, statsAccess, load: loadConstructedCardList });
  const warmCatalog = useCatalogIntentWarm(state, statsAccess, prefetchConstructedCardList);
  const error = failure ? constructedCardRequestError('list', failure.status, '') : null;
  useEffect(() => {
    if (!statsAccessLoading && !statsAccess && STATISTIC_SORTS.has(filters.sort)) update({ filters: { ...filters, sort: 'set', direction: 'asc' }, page: 1 }, true);
  }, [statsAccess, statsAccessLoading, filters, update]);
  const setPage = (page: number) => update({ page });
  const setView = (view: ViewMode) => update({ view });
  const changePeriod = (period: ConstructedCardPeriod) => update({ period, page: 1 });
  const changeRank = (rank: ConstructedCardRank) => update({ rank, page: 1 });
  const changeFormat = (format: CardFormat) => navigatePath(catalogLocationUrl(`/standard/cards/${format}`, { ...state, format, page: 1 }, window.location.search));
  const facets = data?.facets ?? EMPTY_FACETS;
  const sets = [...facets.sets].sort(compareConstructedSets);
  const hasStatsAccess = data ? Boolean(data.statsAccess) : statsAccess;
  const statsGate = { statsAccessLoading, authUser, onRefreshSubscription };
  const dataNotice = data ? constructedCardDataNotice(data) : null;
  const normalizedInputQuery = filters.query.trim();
  const searchPending = Boolean(normalizedInputQuery) && (
    normalizedInputQuery !== requestQuery || loading
  );
  const visibleRankLabel = loading
    ? constructedCardRankLabel(rank)
    : data?.rankLabel || constructedCardRankLabel(rank);
  const currentPatch = data?.period?.patch;
  const visiblePeriodLabel = loading ? constructedCardPeriodLabel(period, currentPatch)
    : data?.period?.label || constructedCardPeriodLabel(period, currentPatch);

  return (
    <div className="constructed-cards">
      <header className="constructed-cards__header">
        <div><h1>Карты</h1><div className="constructed-cards__beta"><span>Бета</span><span>{hasStatsAccess ? <ShieldCheck size={14} /> : <LockKeyhole size={14} />} Статистика {visibleRankLabel}{!hasStatsAccess && ' · подписка Алмаз'}</span></div></div>
        <p>{visibleRankLabel} · <strong>{visiblePeriodLabel}</strong>{loading && data ? <span className="constructed-cards__refreshing"> · обновляем</span> : null}</p>
      </header>

      <section className="constructed-cards__controls" aria-label="Фильтры библиотеки карт" data-loading={loading || undefined}>
        <ConstructedCardCatalogSearch
          query={filters.query}
          total={data?.pagination.total ?? 0}
          pending={searchPending}
          onChange={value => updateFilter('query', value)}
          onClear={clearSearch}
        />
        <div className="constructed-cards__primary-controls">
          <div className="constructed-cards__format" aria-label="Формат" data-tour-id="cards-format">
            <button type="button" aria-label="Стандарт" title="Стандарт" aria-pressed={format === 'standard'} onClick={() => changeFormat('standard')}><img src="/card-format-standard.webp" alt="" /><span className="sr-only">Стандарт</span></button>
            <button type="button" aria-label="Вольный" title="Вольный" aria-pressed={format === 'wild'} onClick={() => changeFormat('wild')}><img src="/card-format-wild.webp" alt="" /><span className="sr-only">Вольный</span></button>
          </div>
          <FilterSelect
            className="constructed-cards__rank-filter"
            label="Ранг"
            value={rank}
            onChange={value => changeRank(value as ConstructedCardRank)}
            onOptionIntent={value => warmCatalog({ rank: value as ConstructedCardRank })}
            tourId="cards-rank"
            options={CONSTRUCTED_CARD_RANK_OPTIONS.map(option => ({
              value: option.id,
              label: option.label,
            }))}
          />
          <FilterSelect
            className="constructed-cards__period-filter"
            label="Период"
            value={period}
            onChange={value => changePeriod(value as ConstructedCardPeriod)}
            onOptionIntent={value => warmCatalog({ period: value as ConstructedCardPeriod })}
            tourId="cards-period"
            options={constructedCardPeriodOptions(currentPatch).map(option => ({
              value: option.id,
              label: option.label,
            }))}
          />
          <FilterSelect
            label="Сортировка"
            value={filters.sort}
            onChange={value => updateFilter('sort', value)}
            tourId="cards-sort"
            options={[
              { value: 'set', label: 'Новые дополнения' },
              ...statisticSortOptions(hasStatsAccess),
              { value: 'mana', label: 'Мана' },
              { value: 'attack', label: 'Атака' },
              { value: 'health', label: 'Здоровье' },
              { value: 'name', label: 'Название' },
              { value: 'class', label: 'Класс' },
              { value: 'mechanics', label: 'Механики' },
            ]}
          />
          {!hasStatsAccess && <span className="constructed-cards__sort-lock" title="Статистические сортировки доступны с тарифом Алмаз"><LockKeyhole size={14} /> Алмаз</span>}
          <FilterSelect
            label="На странице"
            value={String(perPage)}
            onChange={value => update({ perPage: Number(value), page: 1 })}
            options={[{ value: '60', label: '60 карт' }, { value: '120', label: '120 карт' }]}
          />
          <button type="button" className="constructed-cards__direction" onClick={() => updateFilter('direction', filters.direction === 'asc' ? 'desc' : 'asc')} aria-label="Изменить направление сортировки">
            <span aria-hidden="true">{filters.direction === 'asc' ? '↑' : '↓'}</span>
            <span className="constructed-cards__direction-label">{filters.direction === 'asc' ? 'По возрастанию' : 'По убыванию'}</span>
          </button>
          <div className="constructed-cards__view" aria-label="Вид списка" data-tour-id="cards-view-switcher">
            <button type="button" aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}><Grid3X3 size={16} /> Галерея</button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}><List size={17} /> Таблица</button>
          </div>
          <button
            type="button"
            className="constructed-cards__advanced-toggle"
            data-tour-id="cards-filters"
            aria-expanded={mobileFiltersOpen}
            aria-controls="constructed-cards-advanced-filters"
            onClick={() => setMobileFiltersOpen(current => !current)}
          >
            <SlidersHorizontal size={17} /> {mobileFiltersOpen ? 'Скрыть фильтры' : 'Дополнительные фильтры'}
          </button>
        </div>
        <div id="constructed-cards-advanced-filters" className={`constructed-cards__secondary-controls${mobileFiltersOpen ? ' is-open' : ''}`}>
          <FilterSelect label="Класс" value={filters.class} onChange={value => updateFilter('class', value)} tourId="cards-filters" options={classFilterOptions(facets.classes)} visual="class" />
          <FilterSelect label="Дополнение" value={filters.set} onChange={value => updateFilter('set', value)} options={setFilterOptions(sets)} visual="set" />
          <FilterSelect label="Мана" value={filters.mana} onChange={value => updateFilter('mana', value)} options={numericFilterOptions('Любая', '/assets/mana.png')} visual="stat" />
          <FilterSelect label="Атака" value={filters.attack} onChange={value => updateFilter('attack', value)} options={numericFilterOptions('Любая', '/constructed-filter-icons/attack.webp')} visual="stat" />
          <FilterSelect label="Здоровье" value={filters.health} onChange={value => updateFilter('health', value)} options={numericFilterOptions('Любое', '/constructed-filter-icons/health.webp')} visual="stat" />
          <FilterSelect label="Механики" value={filters.mechanic} onChange={value => updateFilter('mechanic', value)} options={textFilterOptions('Все механики', facets.mechanics, value => mechanicLabel(value, data?.mechanicTranslations))} />
          <FilterSelect label="Тип" value={filters.type} onChange={value => updateFilter('type', value)} options={textFilterOptions('Все типы', facets.types, constructedTypeLabel)} />
          <FilterSelect label="Редкость" value={filters.rarity} onChange={value => updateFilter('rarity', value)} options={rarityFilterOptions(facets.rarities)} visual="rarity" align="end" />
          <button type="button" className="constructed-cards__reset" onClick={reset}><RefreshCw size={16} /> Сбросить</button>
        </div>
      </section>

      {dataNotice && <div className="constructed-cards__data-warning" role="status"><AlertTriangle size={18} /><span>{dataNotice}</span></div>}
      {hasStatsAccess && data?.warning && !dataNotice && <div className="constructed-cards__data-warning" role="status"><AlertTriangle size={18} /><span>Список карт доступен, статистика источника временно скрыта из-за некорректного обновления.</span></div>}

      {loading && !data ? <section className="constructed-cards__state" aria-busy="true"><RefreshCw className="constructed-cards__spinner" size={34} /><h2>Загружаем библиотеку</h2><p>Собираем полный список карт и дополнений.</p></section>
        : error ? <section className="constructed-cards__state" role="alert"><h2>{error.title}</h2><p>{error.message}</p>{error.retry && <button type="button" onClick={retry}><RefreshCw size={16} /> Повторить</button>}</section>
          : data && data.cards.length > 0 ? <>{view === 'gallery' ? <CardGallery search={catalogLocationUrl('', state)} cards={data.cards} format={format} period={period} rank={rank} sort={filters.sort} navigatePath={navigatePath} statsAccess={hasStatsAccess} gate={statsGate} /> : <CardTable search={catalogLocationUrl('', state)} cards={data.cards} format={format} period={period} rank={rank} sort={filters.sort} direction={filters.direction} navigatePath={navigatePath} statsAccess={hasStatsAccess} />}<Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} perPage={data.pagination.perPage} onPage={setPage} /></>
            : <section className="constructed-cards__state"><Search size={34} /><h2>Карты не найдены</h2><p>Измените фильтры или сбросьте их.</p><button type="button" onClick={reset}><RefreshCw size={16} /> Сбросить фильтры</button></section>}
    </div>
  );
}

/** The card catalog; the card page is the separate StandardCardDetail bundle. */
export default function StandardCards(props: StandardCardsProps) {
  return <CardsListPage initialFormat={routeState(props.currentPath).format} {...props} />;
}
