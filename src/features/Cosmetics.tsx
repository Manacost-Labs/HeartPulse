import React, {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Coins,
  ExternalLink,
  Image as ImageIcon,
  Maximize2,
  PawPrint,
  Play,
  Search,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import '../route-parchment.css';
import ModalSurface from '../components/ModalSurface/ModalSurface';
import { applyDocumentPageMeta } from '../seo/publicUrlPolicy';
import './Cosmetics.css';

type CosmeticKind = 'heroes' | 'coins' | 'pets';

export type HeroSummary = {
  cardId: string;
  dbf: number | null;
  name: { ru: string; en: string | null };
  class: { slug: string; nameRu: string };
  rarity: { slug: string; nameRu: string };
  categorySlugs: string[];
  images: { static: string | null; animated: string | null };
};

type RelatedCard = {
  cardId: string;
  dbf: number | null;
  name: { ru: string; en: string | null };
};

type CoinSummary = {
  cardId: string;
  dbf: number | null;
  name: { ru: string; en: string | null };
  textRu: string | null;
  images: { card: string | null; crop: string | null };
};

type PetVariant = {
  cardId: string;
  dbf: number | null;
  variantId: number | null;
  name: string;
  level: number | null;
  images: { card: string | null };
};

type PetFamily = {
  petId: number;
  name: string;
  variants: PetVariant[];
};

type CatalogPayload = {
  items: Array<HeroSummary | CoinSummary | PetFamily>;
  generatedBy?: RelatedCard[];
  related?: RelatedCard[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
  updatedAt: string | null;
  source: string;
};

type HeroDetail = HeroSummary & {
  health: number | null;
  character: string | null;
  actor: string | null;
  artist: string | null;
  categories: Array<{ slug: string; nameRu: string }>;
  images: { static: string | null; animated: string | null; fullArt: string | null };
  gallery: Array<{ url: string; caption: string | null }>;
  sounds: Array<{ url: string; type: string; transcript: string | null }>;
  sourceUrl: string | null;
};

type CoinDetail = CoinSummary & {
  text: { ru: string | null; en: string | null };
  images: { card: string | null; golden: string | null; crop: string | null; wiki: string | null };
  generatedBy: RelatedCard[];
  related: RelatedCard[];
};

type PetDetail = PetVariant & {
  pet: { id: number | null; name: string | null };
  images: { card: string | null; endScreen: string | null };
  gallery: Array<{ url: string; caption: string | null }>;
  variants: PetVariant[];
};

type CosmeticsProps = {
  currentPath: string;
  navigatePath: (path: string) => void;
};

const CARD_IMAGE_VERSION = 'cosmetics-20260726';

function cachedCardImage(cardId: string, variant: 'thumb' | 'full' = 'full') {
  return `/api/card-image/${encodeURIComponent(cardId)}/${variant}.webp?v=${CARD_IMAGE_VERSION}`;
}

function cosmeticMediaSource(source: string | null | undefined) {
  if (!source) return '';
  try {
    return new URL(source).hostname.toLowerCase() === 'hearthstone.wiki.gg'
      ? `/api/cosmetics/media?url=${encodeURIComponent(source)}`
      : source;
  } catch {
    return source;
  }
}

type HeroFilters = {
  q: string;
  classSlug: string;
  rarity: string;
  category: string;
};

type CatalogControls = {
  filters: HeroFilters;
  page: number;
};

type CatalogControlsAction =
  | { type: 'filters'; patch: Partial<HeroFilters> }
  | { type: 'page'; page: number };

type CatalogRequestState = {
  requestUrl: string;
  payload: CatalogPayload | null;
  error: string | null;
};

type DetailPayload = HeroDetail | CoinDetail | PetDetail;

type DetailRequestState = {
  requestKey: string;
  detail: DetailPayload | null;
  error: string | null;
};

const CLASS_OPTIONS = [
  ['', 'Все классы'],
  ['deathknight', 'Рыцарь смерти'],
  ['demonhunter', 'Охотник на демонов'],
  ['druid', 'Друид'],
  ['hunter', 'Охотник'],
  ['mage', 'Маг'],
  ['paladin', 'Паладин'],
  ['priest', 'Жрец'],
  ['rogue', 'Разбойник'],
  ['shaman', 'Шаман'],
  ['warlock', 'Чернокнижник'],
  ['warrior', 'Воин'],
] as const;

const RARITY_OPTIONS = [
  ['', 'Все редкости'],
  ['basic', 'Базовые'],
  ['lite', 'Обычные'],
  ['full', 'Полные'],
  ['diamond', 'Алмазные'],
  ['legendary', 'Легендарные'],
  ['mythic', 'Мифические'],
] as const;

const CATEGORY_OPTIONS = [
  ['', 'Любой способ получения'],
  ['2500_runestone_skins', 'За 2500 рунических камней'],
  ['battle_pass', 'Боевой пропуск'],
  ['events_promos', 'Ивенты и акции'],
  ['unavailable', 'Недоступные'],
  ['money', 'За деньги и в наборах'],
  ['expansion_preorder_heroes', 'Предзаказ дополнения'],
  ['tavern_regular_portraits', 'Достижение Tavern Regular'],
  ['1800_gold_skins', 'За 1800 золота'],
  ['1200_gold_skins', 'За 1200 золота'],
] as const;

const KIND_META: Record<CosmeticKind, {
  label: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = {
  heroes: {
    label: 'Скины героев',
    title: 'Скины героев',
    description: 'Портреты всех классов с редкостью, способом получения, полными артами и анимациями на отдельных страницах.',
    icon: CircleUserRound,
  },
  coins: {
    label: 'Монеты',
    title: 'Косметические монеты',
    description: 'Варианты Монетки, их арты и карты, связанные с механикой монет.',
    icon: Coins,
  },
  pets: {
    label: 'Питомцы',
    title: 'Питомцы',
    description: 'Все семейства и раскраски питомцев с End Screen и дополнительными артами.',
    icon: PawPrint,
  },
};

const requestCache = new Map<string, { etag: string | null; payload: any }>();

async function fetchCosmetics<T>(url: string, signal: AbortSignal): Promise<T> {
  const cached = requestCache.get(url);
  const response = await fetch(url, {
    signal,
    headers: cached?.etag ? { 'If-None-Match': cached.etag } : undefined,
  });
  if (response.status === 304 && cached) return cached.payload as T;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  const payload = await response.json() as T;
  requestCache.set(url, { etag: response.headers.get('etag'), payload });
  return payload;
}

function normalizedPath(path: string) {
  return path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/cosmetics';
}

function routeState(path: string): { kind: CosmeticKind; cardId: string | null } {
  const clean = normalizedPath(path);
  const match = clean.match(/^\/cosmetics\/(heroes|coins|pets)(?:\/([A-Za-z0-9_-]+))?$/);
  if (match) return { kind: match[1] as CosmeticKind, cardId: match[2] ? decodeURIComponent(match[2]) : null };
  return { kind: 'heroes', cardId: null };
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(callback: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => false);
}

function initializeCatalogControls(): CatalogControls {
  const params = new URLSearchParams(window.location.search);
  return {
    filters: {
      q: params.get('search') || '',
      classSlug: params.get('class') || '',
      rarity: params.get('rarity') || '',
      category: params.get('category') || '',
    },
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

function catalogControlsReducer(state: CatalogControls, action: CatalogControlsAction): CatalogControls {
  if (action.type === 'filters') {
    return {
      filters: { ...state.filters, ...action.patch },
      page: 1,
    };
  }
  return {
    ...state,
    page: Math.max(1, action.page),
  };
}

function formatUpdatedAt(value: string | null) {
  if (!value) return 'время не указано';
  const parsed = new Date(value.replace(' ', 'T') + (value.includes('Z') || /[+-]\d\d:\d\d$/.test(value) ? '' : 'Z'));
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function CatalogTabs({ active, navigatePath }: { active: CosmeticKind; navigatePath: (path: string) => void }) {
  return (
    <nav className="cosmetics-tabs" aria-label="Разделы косметики">
      {(Object.keys(KIND_META) as CosmeticKind[]).map(kind => {
        const meta = KIND_META[kind];
        const Icon = meta.icon;
        return (
          <a
            key={kind}
            href={`/cosmetics/${kind}`}
            className={`cosmetics-tab${active === kind ? ' cosmetics-tab-active' : ''}`}
            aria-current={active === kind ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigatePath(`/cosmetics/${kind}`);
            }}
          >
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{meta.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

export type CosmeticsMediaItem = {
  type: 'image' | 'video';
  src: string;
  title: string;
  poster?: string | null;
  autoPlay?: boolean;
};

export function CosmeticsMediaLightbox({
  media,
  onClose,
}: {
  media: CosmeticsMediaItem;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <ModalSurface
      className="cosmetics-media-lightbox"
      panelClassName="cosmetics-media-lightbox__panel"
      backdropClassName="cosmetics-media-lightbox__backdrop"
      ariaLabelledBy={titleId}
      initialFocusRef={closeRef}
      onClose={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        className="cosmetics-media-lightbox__close"
        aria-label="Закрыть просмотр"
        onClick={onClose}
      >
        <X size={24} aria-hidden="true" />
      </button>
      <div className="cosmetics-media-lightbox__media">
        {media.type === 'video' ? (
          <video
            src={cosmeticMediaSource(media.src)}
            poster={cosmeticMediaSource(media.poster) || undefined}
            controls
            autoPlay={media.autoPlay}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={media.title}
          />
        ) : (
          <img src={cosmeticMediaSource(media.src)} alt={media.title} decoding="async" />
        )}
      </div>
      <div className="cosmetics-media-lightbox__caption">
        <strong id={titleId}>{media.title}</strong>
      </div>
    </ModalSurface>
  );
}

export function HeroSkinCard({
  item,
  navigatePath,
}: {
  item: HeroSummary;
  navigatePath: (path: string) => void;
}) {
  const href = `/cosmetics/heroes/${encodeURIComponent(item.cardId)}`;

  return (
    <a
      href={href}
      className="cosmetics-card cosmetics-hero-card"
      onClick={(event) => {
        event.preventDefault();
        navigatePath(href);
      }}
    >
      <span className="cosmetics-card-media">
        {item.images.static ? (
          <img
            src={item.images.static}
            alt={`Скин героя «${item.name.ru}»`}
            loading="lazy"
            decoding="async"
            width="512"
            height="768"
          />
        ) : <span className="cosmetics-media-placeholder"><ImageIcon aria-hidden="true" /></span>}
      </span>
      <strong className="cosmetics-card-name">{item.name.ru}</strong>
    </a>
  );
}

function CoinCard({ item, navigatePath }: { item: CoinSummary; navigatePath: (path: string) => void }) {
  const href = `/cosmetics/coins/${encodeURIComponent(item.cardId)}`;
  return (
    <a
      href={href}
      className="cosmetics-card cosmetics-coin-card"
      onClick={(event) => {
        event.preventDefault();
        navigatePath(href);
      }}
    >
      <span className="cosmetics-card-media">
        <img
          src={cachedCardImage(item.cardId)}
          alt={item.name.en || item.name.ru}
          loading="lazy"
          decoding="async"
          width="512"
          height="768"
        />
      </span>
      <strong className="cosmetics-card-name">{item.name.en || item.name.ru}</strong>
    </a>
  );
}

function PetCard({ item, navigatePath }: { item: PetVariant; navigatePath: (path: string) => void }) {
  const href = `/cosmetics/pets/${encodeURIComponent(item.cardId)}`;
  return (
    <a
      href={href}
      className="cosmetics-card cosmetics-pet-card"
      onClick={(event) => {
        event.preventDefault();
        navigatePath(href);
      }}
    >
      <span className="cosmetics-card-media">
        {item.images.card ? (
          <img src={item.images.card} alt={`Питомец «${item.name}»`} loading="lazy" decoding="async" width="512" height="768" />
        ) : <span className="cosmetics-media-placeholder"><PawPrint aria-hidden="true" /></span>}
      </span>
      <strong className="cosmetics-card-name">{item.name}</strong>
    </a>
  );
}

function RelatedCards({
  title,
  items,
  open = false,
}: {
  title: string;
  items: RelatedCard[];
  open?: boolean;
}) {
  return (
    <details className="cosmetics-related" open={open}>
      <summary>
        <span>{title}</span>
        <span className="cosmetics-count">{items.length}</span>
      </summary>
      <div className="cosmetics-related-grid">
        {items.map(card => (
          <a key={card.cardId} href={`/standard/cards/wild/${encodeURIComponent(card.cardId)}`}>
            <img
              src={cachedCardImage(card.cardId, 'thumb')}
              alt=""
              loading="lazy"
              decoding="async"
              width="128"
              height="192"
            />
            <span><strong>{card.name.ru}</strong><small>{card.cardId}</small></span>
          </a>
        ))}
      </div>
    </details>
  );
}

function HeroFiltersPanel({
  filters,
  onChange,
}: {
  filters: HeroFilters;
  onChange: (patch: Partial<HeroFilters>) => void;
}) {
  return (
    <section className="cosmetics-filters" aria-label="Фильтры скинов">
      <label className="cosmetics-search">
        <span className="sr-only">Поиск скина</span>
        <Search size={20} aria-hidden="true" />
        <input
          name="cosmetics-q"
          value={filters.q}
          onChange={event => onChange({ q: event.target.value })}
          placeholder="Название, ID или DBF…"
          type="search"
        />
      </label>
      <label>
        <span>Класс</span>
        <select name="cosmetics-class" value={filters.classSlug} onChange={event => onChange({ classSlug: event.target.value })}>
          {CLASS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>
        <span>Редкость</span>
        <select name="cosmetics-rarity" value={filters.rarity} onChange={event => onChange({ rarity: event.target.value })}>
          {RARITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>
        <span>Получение</span>
        <select name="cosmetics-category" value={filters.category} onChange={event => onChange({ category: event.target.value })}>
          {CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </section>
  );
}

function LoadingGrid() {
  return (
    <div className="cosmetics-grid cosmetics-grid-loading" aria-label="Загрузка косметики">
      {Array.from({ length: 12 }, (_, index) => <span key={index} className="cosmetics-skeleton" />)}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="cosmetics-empty">
      <Sparkles size={34} aria-hidden="true" />
      <strong>Ничего не найдено</strong>
      <span>Измените поиск или один из фильтров.</span>
    </div>
  );
}

function CatalogView({
  kind,
  navigatePath,
}: {
  kind: CosmeticKind;
  navigatePath: (path: string) => void;
}) {
  const [controls, dispatchControls] = useReducer(
    catalogControlsReducer,
    undefined,
    initializeCatalogControls,
  );
  const { filters, page } = controls;
  const deferredQuery = useDeferredValue(filters.q);
  const request = useMemo(() => {
    const params = new URLSearchParams();
    if (kind === 'heroes') {
      if (deferredQuery) params.set('search', deferredQuery);
      if (filters.classSlug) params.set('class', filters.classSlug);
      if (filters.rarity) params.set('rarity', filters.rarity);
      if (filters.category) params.set('category', filters.category);
    }
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return {
      query,
      url: `/api/cosmetics/${kind}${query ? `?${query}` : ''}`,
    };
  }, [kind, deferredQuery, filters.classSlug, filters.rarity, filters.category, page]);
  const [requestState, setRequestState] = useState<CatalogRequestState>({
    requestUrl: '',
    payload: null,
    error: null,
  });
  const currentRequest = requestState.requestUrl === request.url ? requestState : null;
  const payload = currentRequest?.payload ?? null;
  const error = currentRequest?.error ?? null;
  const loading = currentRequest === null;
  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${request.query ? `?${request.query}` : ''}`,
    );

    const controller = new AbortController();
    fetchCosmetics<CatalogPayload>(request.url, controller.signal)
      .then(result => {
        setRequestState({ requestUrl: request.url, payload: result, error: null });
        if (result.pagination.page !== page) {
          dispatchControls({ type: 'page', page: result.pagination.page });
        }
      })
      .catch(requestError => {
        if (requestError?.name !== 'AbortError') {
          setRequestState({
            requestUrl: request.url,
            payload: null,
            error: requestError instanceof Error ? requestError.message : 'Не удалось загрузить каталог',
          });
        }
      });
    return () => controller.abort();
  }, [request.query, request.url, page]);

  const updateFilters = (patch: Partial<HeroFilters>) => {
    dispatchControls({ type: 'filters', patch });
  };

  const items = payload?.items ?? [];
  return (
    <>
      {kind === 'heroes' && <HeroFiltersPanel filters={filters} onChange={updateFilters} />}
      {kind === 'coins' && payload && (
        <section className="cosmetics-relations-section" aria-labelledby="coin-relations-title">
          <div>
            <span className="cosmetics-kicker">Связанные карты</span>
            <h2 id="coin-relations-title">Монеты в механиках Hearthstone</h2>
          </div>
          <RelatedCards title="Карты, которые генерируют монеты" items={payload.generatedBy ?? []} />
          <RelatedCards title="Карты, которые связаны с монетами" items={payload.related ?? []} />
        </section>
      )}

      {error && !payload && <div className="cosmetics-error" role="alert">{error}</div>}
      {!payload && loading ? <LoadingGrid /> : (
        <>
          <div className="cosmetics-results-meta" aria-live="polite">
            <span>{payload?.pagination.total.toLocaleString('ru-RU') ?? 0} объектов</span>
            {loading && <span>Обновляем…</span>}
          </div>
          <div className={`cosmetics-grid cosmetics-grid-${kind}`} aria-busy={loading}>
            {kind === 'heroes' && (items as HeroSummary[]).map(item => (
              <HeroSkinCard key={item.cardId} item={item} navigatePath={navigatePath} />
            ))}
            {kind === 'coins' && (items as CoinSummary[]).map(item => (
              <CoinCard key={item.cardId} item={item} navigatePath={navigatePath} />
            ))}
            {kind === 'pets' && (items as PetFamily[]).flatMap(family => family.variants.map(item => (
              <PetCard key={item.cardId} item={item} navigatePath={navigatePath} />
            )))}
          </div>
          {!loading && items.length === 0 && <EmptyState />}
          {(payload?.pagination.totalPages ?? 1) > 1 && (
            <nav className="cosmetics-pagination" aria-label="Страницы каталога">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => dispatchControls({ type: 'page', page: page - 1 })}
              >
                <ChevronLeft size={18} aria-hidden="true" /> Назад
              </button>
              <span>Страница {payload?.pagination.page} из {payload?.pagination.totalPages}</span>
              <button
                type="button"
                disabled={page >= (payload?.pagination.totalPages ?? 1) || loading}
                onClick={() => dispatchControls({ type: 'page', page: page + 1 })}
              >
                Вперёд <ChevronRight size={18} aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}
      {payload && (
        <p className="cosmetics-source">
          Источник: {payload.source} · обновлено {formatUpdatedAt(payload.updatedAt)}
        </p>
      )}
    </>
  );
}

function DetailGallery({ items, title }: { items: Array<{ url: string; caption: string | null }>; title: string }) {
  if (!items.length) return null;
  return (
    <section className="cosmetics-detail-section">
      <h2>{title}</h2>
      <div className="cosmetics-art-grid">
        {items.map((item, index) => (
          <figure key={`${item.url}-${index}`}>
            <a href={item.url} target="_blank" rel="noreferrer">
              <img src={cosmeticMediaSource(item.url)} alt={item.caption || `${title}, изображение ${index + 1}`} loading="lazy" decoding="async" />
            </a>
            {item.caption && <figcaption>{item.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </section>
  );
}

function HeroDetailView({ detail }: { detail: HeroDetail }) {
  const reducedMotion = useReducedMotion();
  const [activeMedia, setActiveMedia] = useState<CosmeticsMediaItem | null>(null);
  return (
    <>
      <div className="cosmetics-detail-hero">
        <div className="cosmetics-detail-primary-media">
          {detail.images.static && <img src={detail.images.static} alt={`Скин «${detail.name.ru}»`} width="512" height="768" />}
        </div>
        <div className="cosmetics-detail-copy">
          <span className="cosmetics-kicker">{detail.class.nameRu} · {detail.rarity.nameRu}</span>
          <h1>{detail.name.ru}</h1>
          {detail.name.en && detail.name.en !== detail.name.ru && <p className="cosmetics-detail-subtitle">{detail.name.en}</p>}
          <dl className="cosmetics-facts">
            <div><dt>ID</dt><dd>{detail.cardId}</dd></div>
            <div><dt>DBF</dt><dd>{detail.dbf ?? '—'}</dd></div>
            <div><dt>Художник</dt><dd>{detail.artist || 'Не указан'}</dd></div>
            <div><dt>Актёр озвучки</dt><dd>{detail.actor || 'Не указан'}</dd></div>
          </dl>
          <div className="cosmetics-chips">
            {detail.categories.map(category => <span key={category.slug}>{category.nameRu}</span>)}
          </div>
          {detail.sourceUrl && (
            <a className="cosmetics-source-link" href={detail.sourceUrl} target="_blank" rel="noreferrer">
              Hearthstone Wiki <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      {(detail.images.animated || detail.images.fullArt) && (
        <section className="cosmetics-detail-section">
          <h2>Анимация и полный арт</h2>
          <div className="cosmetics-featured-media">
            {detail.images.animated && (
              <button
                type="button"
                className="cosmetics-media-trigger"
                onClick={() => setActiveMedia({
                  type: 'video',
                  src: detail.images.animated!,
                  poster: detail.images.static,
                  title: `Анимация скина «${detail.name.ru}»`,
                  autoPlay: !reducedMotion,
                })}
              >
                {detail.images.static
                  ? <img src={detail.images.static} alt="" loading="lazy" decoding="async" />
                  : <span className="cosmetics-media-placeholder"><Play aria-hidden="true" /></span>}
                <span><Play size={18} aria-hidden="true" /> Анимация скина</span>
              </button>
            )}
            {detail.images.fullArt && (
              <button
                type="button"
                className="cosmetics-media-trigger"
                onClick={() => setActiveMedia({
                  type: 'image',
                  src: detail.images.fullArt!,
                  title: `Полный арт «${detail.name.ru}»`,
                })}
              >
                <img src={cosmeticMediaSource(detail.images.fullArt)} alt="" loading="lazy" decoding="async" />
                <span><Maximize2 size={18} aria-hidden="true" /> Полный арт</span>
              </button>
            )}
          </div>
        </section>
      )}
      {detail.sounds.length > 0 && (
        <section className="cosmetics-detail-section">
          <h2><Volume2 size={23} aria-hidden="true" /> Звуковые дорожки <span className="cosmetics-count">{detail.sounds.length}</span></h2>
          <div className="cosmetics-sounds">
            {detail.sounds.map((sound, index) => (
              <article key={`${sound.url}-${index}`}>
                <div><strong>{sound.type}</strong>{sound.transcript && <p>{sound.transcript}</p>}</div>
                <audio
                  controls
                  preload="none"
                  src={cosmeticMediaSource(sound.url)}
                  aria-label={`${sound.type}: ${sound.transcript || `дорожка ${index + 1}`}`}
                >
                  Ваш браузер не поддерживает аудио.
                </audio>
              </article>
            ))}
          </div>
        </section>
      )}
      <DetailGallery items={detail.gallery} title="Галерея" />
      {activeMedia && <CosmeticsMediaLightbox media={activeMedia} onClose={() => setActiveMedia(null)} />}
    </>
  );
}

function CoinDetailView({ detail }: { detail: CoinDetail }) {
  return (
    <>
      <div className="cosmetics-detail-hero">
        <div className="cosmetics-detail-primary-media cosmetics-detail-crop">
          {detail.images.crop && <img src={detail.images.crop} alt={`Арт «${detail.name.en || detail.name.ru}»`} />}
        </div>
        <div className="cosmetics-detail-copy">
          <span className="cosmetics-kicker">Косметическая монета</span>
          <h1>{detail.name.en || detail.name.ru}</h1>
          <p className="cosmetics-detail-subtitle">{detail.name.ru}</p>
          <dl className="cosmetics-facts">
            <div><dt>ID</dt><dd>{detail.cardId}</dd></div>
            <div><dt>DBF</dt><dd>{detail.dbf ?? '—'}</dd></div>
          </dl>
          {detail.text.ru && <p>{detail.text.ru}</p>}
        </div>
      </div>
      <section className="cosmetics-relations-section">
        <RelatedCards title="Карты, которые генерируют монеты" items={detail.generatedBy} />
        <RelatedCards title="Карты, которые связаны с монетами" items={detail.related} open />
      </section>
    </>
  );
}

function PetDetailView({ detail, navigatePath }: { detail: PetDetail; navigatePath: (path: string) => void }) {
  return (
    <>
      <div className="cosmetics-detail-hero">
        <div className="cosmetics-detail-primary-media">
          {detail.images.card && <img src={detail.images.card} alt={`Питомец «${detail.name}»`} width="512" height="768" />}
        </div>
        <div className="cosmetics-detail-copy">
          <span className="cosmetics-kicker">{detail.pet.name || 'Питомец'} · раскраска {detail.level ?? '—'}</span>
          <h1>{detail.name}</h1>
          <dl className="cosmetics-facts">
            <div><dt>ID</dt><dd>{detail.cardId}</dd></div>
            <div><dt>DBF</dt><dd>{detail.dbf ?? '—'}</dd></div>
          </dl>
        </div>
      </div>
      {detail.images.endScreen && (
        <section className="cosmetics-detail-section">
          <h2>End Screen</h2>
          <img className="cosmetics-end-screen" src={detail.images.endScreen} alt={`End Screen питомца «${detail.name}»`} loading="lazy" decoding="async" />
        </section>
      )}
      {detail.variants.length > 1 && (
        <section className="cosmetics-detail-section">
          <h2>Другие раскраски</h2>
          <div className="cosmetics-grid cosmetics-grid-pets cosmetics-variants-grid">
            {detail.variants.map(variant => <PetCard key={variant.cardId} item={variant} navigatePath={navigatePath} />)}
          </div>
        </section>
      )}
      <DetailGallery items={detail.gallery} title="Галерея" />
    </>
  );
}

function DetailView({
  kind,
  cardId,
  navigatePath,
}: {
  kind: CosmeticKind;
  cardId: string;
  navigatePath: (path: string) => void;
}) {
  const requestKey = `${kind}:${cardId}`;
  const [requestState, setRequestState] = useState<DetailRequestState>({
    requestKey: '',
    detail: null,
    error: null,
  });
  const currentRequest = requestState.requestKey === requestKey ? requestState : null;
  const detail = currentRequest?.detail ?? null;
  const error = currentRequest?.error ?? null;
  useEffect(() => {
    const controller = new AbortController();
    fetchCosmetics<DetailPayload>(
      `/api/cosmetics/${kind}/${encodeURIComponent(cardId)}`,
      controller.signal,
    )
      .then(result => setRequestState({ requestKey, detail: result, error: null }))
      .catch(requestError => {
        if (requestError?.name !== 'AbortError') {
          setRequestState({
            requestKey,
            detail: null,
            error: requestError instanceof Error ? requestError.message : 'Не удалось загрузить страницу',
          });
        }
      });
    return () => controller.abort();
  }, [kind, cardId, requestKey]);

  useEffect(() => {
    if (!detail) return;
    const displayName = kind === 'heroes'
      ? (detail as HeroDetail).name.ru
      : kind === 'coins'
        ? ((detail as CoinDetail).name.en || (detail as CoinDetail).name.ru)
        : (detail as PetDetail).name;
    const image = kind === 'heroes'
      ? (detail as HeroDetail).images.static
      : kind === 'coins'
        ? (detail as CoinDetail).images.crop
        : (detail as PetDetail).images.card;
    void applyDocumentPageMeta({
      title: `${displayName} — косметика Hearthstone | Manacost`,
      description: kind === 'heroes'
        ? `Скин героя «${displayName}»: редкость, класс, художник, анимация, полный арт и звуковые дорожки.`
        : kind === 'coins'
          ? `Косметическая монета «${displayName}»: ID, DBF, изображение карты, crop-арт и связанные карты.`
          : `Питомец «${displayName}»: карточка, End Screen, дополнительные арты и другие раскраски семейства.`,
      pathname: `/cosmetics/${kind}/${cardId}`,
      image,
    });
  }, [kind, cardId, detail]);

  if (error) return <div className="cosmetics-error" role="alert">{error}</div>;
  if (!detail) return <LoadingGrid />;
  return (
    <article className="cosmetics-detail">
      <a
        className="cosmetics-back"
        href={`/cosmetics/${kind}`}
        onClick={(event) => {
          event.preventDefault();
          navigatePath(`/cosmetics/${kind}`);
        }}
      >
        <ArrowLeft size={18} aria-hidden="true" /> К каталогу
      </a>
      {kind === 'heroes' && <HeroDetailView detail={detail as HeroDetail} />}
      {kind === 'coins' && <CoinDetailView detail={detail as CoinDetail} />}
      {kind === 'pets' && <PetDetailView detail={detail as PetDetail} navigatePath={navigatePath} />}
    </article>
  );
}

export default function Cosmetics({ currentPath, navigatePath }: CosmeticsProps) {
  const route = routeState(currentPath);
  const meta = KIND_META[route.kind];
  return (
    <div className="route-parchment-page cosmetics-page">
      {!route.cardId && (
        <header className="route-parchment-hero cosmetics-hero">
          <span className="cosmetics-kicker">Коллекция Hearthstone</span>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </header>
      )}
      <CatalogTabs active={route.kind} navigatePath={navigatePath} />
      <section className="cosmetics-surface" aria-label="Каталог косметики Hearthstone">
        {route.cardId
          ? <DetailView kind={route.kind} cardId={route.cardId} navigatePath={navigatePath} />
          : <CatalogView key={route.kind} kind={route.kind} navigatePath={navigatePath} />}
      </section>
    </div>
  );
}
