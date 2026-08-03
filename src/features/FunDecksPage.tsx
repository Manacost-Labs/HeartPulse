import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Clock3,
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';
import '../route-parchment.css';
import DeckListView from './decklist/DeckListView';
import DeckRenderPreview from './deckrender/DeckRenderPreview';
import { useResolvedDeck } from './decklist/useResolvedDeck';
import './FunDecksPage.css';

type FunDeckRow = {
  title: string;
  deckCode: string;
  format: string;
  className: string;
  streamer: string | null;
  funScore: number | null;
  maxMetaSimilarity: number | null;
  nearestArchetype: string | null;
  winRate: number | null;
  games: number | null;
  reasons: string[];
  url: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

type FunDecksPayload = {
  fetchedAt: string | null;
  stats: {
    total: number;
    standard: number;
    wild: number;
  };
  methodology: {
    detectorVersion: string | null;
    minFunScore: number;
    maxMetaSimilarity: number;
  };
  decks: FunDeckRow[];
};

type FormatFilter = 'all' | 'standard' | 'wild';
type SortMode = 'newest' | 'fun';

const EMPTY_DATA: FunDecksPayload = {
  fetchedAt: null,
  stats: { total: 0, standard: 0, wild: 0 },
  methodology: { detectorVersion: null, minFunScore: 0.55, maxMetaSimilarity: 0.42 },
  decks: [],
};

const FREE_PREVIEW_COUNT = 3;
const DEFAULT_PAYWALL_ACCESS: PaywallAccessState = {
  authUser: null,
  subscriptionStatus: null,
  subscriptionLoading: false,
  onRefreshSubscription: async () => null,
};

const CLASS_META: Record<string, { label: string; color: string; icon: string }> = {
  deathknight: { label: 'Рыцарь смерти', color: '#397b87', icon: '/class_icon/ui/deathknight-64.webp' },
  demonhunter: { label: 'Охотник на демонов', color: '#556d24', icon: '/class_icon/ui/demonhunter-64.webp' },
  druid: { label: 'Друид', color: '#8b4d25', icon: '/class_icon/ui/druid-64.webp' },
  hunter: { label: 'Охотник', color: '#3f792f', icon: '/class_icon/ui/hunter-64.webp' },
  mage: { label: 'Маг', color: '#326c97', icon: '/class_icon/ui/mage-64.webp' },
  paladin: { label: 'Паладин', color: '#a77816', icon: '/class_icon/ui/paladin-64.webp' },
  priest: { label: 'Жрец', color: '#6e6862', icon: '/class_icon/ui/priest-64.webp' },
  rogue: { label: 'Разбойник', color: '#55545b', icon: '/class_icon/ui/rogue-64.webp' },
  shaman: { label: 'Шаман', color: '#345aa0', icon: '/class_icon/ui/shaman-64.webp' },
  warlock: { label: 'Чернокнижник', color: '#694477', icon: '/class_icon/ui/warlock-64.webp' },
  warrior: { label: 'Воин', color: '#8e342f', icon: '/class_icon/ui/warrior-64.webp' },
};

const HERO_CLASS_BY_DBF: Record<number, string> = {
  7: 'warrior',
  31: 'hunter',
  274: 'druid',
  637: 'mage',
  671: 'paladin',
  813: 'priest',
  893: 'warlock',
  930: 'rogue',
  1066: 'shaman',
  56550: 'demonhunter',
  78065: 'deathknight',
};

function normalizeClass(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function formatOf(deck: FunDeckRow): 'standard' | 'wild' {
  return deck.format.toLowerCase() === 'wild' ? 'wild' : 'standard';
}

function percent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: digits })}%`;
}

function score(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function updatedLabel(value: string | null): string {
  const parsed = timestamp(value);
  if (!parsed) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function metaDistance(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round((1 - Math.max(0, Math.min(1, value))) * 100)}%`;
}

function timestamp(value: string | null): number {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecentlyAdded(deck: FunDeckRow, fetchedAt: string | null): boolean {
  const firstSeen = timestamp(deck.firstSeenAt);
  const reference = timestamp(fetchedAt) || Date.now();
  return firstSeen > 0 && firstSeen >= reference - 72 * 60 * 60 * 1_000;
}

function FunDeckCard({
  deck,
  fresh = false,
  tourAnchor = false,
}: {
  deck: FunDeckRow;
  fresh?: boolean;
  tourAnchor?: boolean;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
  const format = formatOf(deck);
  const { data, loading, error, reload } = useResolvedDeck(deck.deckCode, {
    format,
    archetype: deck.nearestArchetype || undefined,
  });
  const resolvedClass = data ? HERO_CLASS_BY_DBF[data.heroDbfId] : '';
  const classMeta = CLASS_META[normalizeClass(deck.className)] || CLASS_META[resolvedClass] || {
    label: deck.className && deck.className !== '—' ? deck.className : 'Класс определяется',
    color: '#67131c',
    icon: '/arena-logo-icon.webp',
  };
  const copyLabel = {
    idle: 'Скопировать код колоды',
    ok: 'Код скопирован',
    error: 'Не удалось скопировать',
  }[copyState];

  useEffect(() => {
    if (copyState === 'idle') return undefined;
    const timeout = window.setTimeout(
      () => setCopyState('idle'),
      copyState === 'ok' ? 1600 : 2000,
    );
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const copyDeckCode = async () => {
    try {
      await navigator.clipboard.writeText(deck.deckCode);
      setCopyState('ok');
    } catch {
      setCopyState('error');
    }
  };

  return (
    <article className="fun-deck-card">
      <header className="fun-deck-card__identity">
        <img src={classMeta.icon} alt="" width="64" height="64" loading="lazy" decoding="async" />
        <div>
          <span>
            {format === 'wild' ? 'Вольный формат' : 'Стандарт'}
            {fresh ? <strong>Новая</strong> : null}
          </span>
          <h2>{deck.title}</h2>
          <p>{classMeta.label}{deck.streamer ? ` · ${deck.streamer}` : ''}</p>
        </div>
      </header>

      <dl className="fun-deck-card__metrics" data-tour-id={tourAnchor ? 'fun-decks-card-metrics' : undefined}>
        <div>
          <dt>Винрейт</dt>
          <dd>{percent(deck.winRate)}</dd>
        </div>
        <div>
          <dt>Игры</dt>
          <dd>{deck.games?.toLocaleString('ru-RU') ?? '—'}</dd>
        </div>
        <div>
          <dt>Не похожа на мету</dt>
          <dd>{metaDistance(deck.maxMetaSimilarity)}</dd>
        </div>
        <div>
          <dt>Индекс фана</dt>
          <dd>{score(deck.funScore)}</dd>
        </div>
      </dl>

      <div
        className="fun-deck-card__deck"
        data-tour-id={tourAnchor ? 'fun-decks-deck-list' : undefined}
        style={{ ['--fun-deck-class' as string]: classMeta.color }}
      >
        <DeckRenderPreview deckCode={deck.deckCode} deckName={deck.title}>
          {data ? (
            <DeckListView
              cards={data.cards}
              sideboards={data.sideboards}
              title={classMeta.label}
              subtitle={format === 'wild' ? 'Вольный формат' : 'Стандарт'}
              headerColor={classMeta.color}
              totalCards={data.totalCards}
              deckSizeLimit={data.deckSizeLimit}
              deckCode={deck.deckCode}
              emptyText="Состав этой колоды пока недоступен."
            />
          ) : error ? (
            <div className="fun-deck-card__deck-state fun-deck-card__deck-state--error" role="alert">
              <TriangleAlert aria-hidden="true" />
              <strong>Состав не загрузился</strong>
              <span>{error}</span>
              <button type="button" onClick={reload}>
                <RefreshCw aria-hidden="true" />
                Повторить
              </button>
            </div>
          ) : (
            <div className="fun-deck-card__deck-state" aria-busy={loading}>
              {Array.from({ length: 10 }, (_, index) => (
                <span key={index} className="fun-deck-card__deck-skeleton" />
              ))}
            </div>
          )}
        </DeckRenderPreview>
        <button
          type="button"
          className={`fun-deck-card__copy${copyState === 'ok' ? ' is-copied' : ''}`}
          aria-label={`${copyLabel}: ${deck.title}`}
          onClick={() => void copyDeckCode()}
        >
          <Copy aria-hidden="true" />
          <span aria-live="polite">{copyLabel}</span>
        </button>
      </div>

      {deck.url ? (
        <footer className="fun-deck-card__source">
          <a href={deck.url} target="_blank" rel="noreferrer">
            Открыть на HSGuru
            <ExternalLink aria-hidden="true" />
          </a>
        </footer>
      ) : null}
    </article>
  );
}

export default function FunDecksPage({
  hasFullAccess = true,
  paywall = DEFAULT_PAYWALL_ACCESS,
}: {
  hasFullAccess?: boolean;
  paywall?: PaywallAccessState;
}) {
  const [data, setData] = useState<FunDecksPayload>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(6);
  const deferredQuery = useDeferredValue(query);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/fun-decks', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить подборку');
      setData(payload as FunDecksPayload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить подборку');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredDecks = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase('ru-RU');
    const formatDecks = data.decks.filter(deck => (
      formatFilter === 'all' || formatOf(deck) === formatFilter
    ));
    const sortedDecks = [...formatDecks].sort((left, right) => {
      if (sortMode === 'fun') {
        return (right.funScore ?? 0) - (left.funScore ?? 0)
          || timestamp(right.firstSeenAt) - timestamp(left.firstSeenAt);
      }
      return timestamp(right.firstSeenAt) - timestamp(left.firstSeenAt)
        || (right.funScore ?? 0) - (left.funScore ?? 0);
    });
    const accessibleDecks = hasFullAccess ? sortedDecks : sortedDecks.slice(0, FREE_PREVIEW_COUNT);
    return accessibleDecks.filter(deck => {
      if (!needle) return true;
      const classLabel = CLASS_META[normalizeClass(deck.className)]?.label || deck.className;
      return `${deck.title} ${classLabel} ${deck.streamer || ''} ${deck.nearestArchetype || ''}`
        .toLocaleLowerCase('ru-RU')
        .includes(needle);
    });
  }, [data.decks, deferredQuery, formatFilter, hasFullAccess, sortMode]);

  const visibleDecks = filteredDecks.slice(0, visibleCount);
  const filterButtons: Array<{ id: FormatFilter; label: string; count: number }> = [
    { id: 'all', label: 'Все', count: data.stats.total },
    { id: 'standard', label: 'Стандарт', count: data.stats.standard },
    { id: 'wild', label: 'Вольный', count: data.stats.wild },
  ];

  return (
    <div className="fun-decks-page">
      <header className="traditional-mode-banner">
        <div className="traditional-mode-banner__copy">
          <h1>Фан-колоды</h1>
          <p>Необычные сборки Стандарта и Вольного режима для новых впечатлений от игры.</p>
          {data.fetchedAt ? (
            <p className="fun-decks-freshness">
              <Clock3 aria-hidden="true" />
              Обновлено <time dateTime={data.fetchedAt}>{updatedLabel(data.fetchedAt)}</time>
            </p>
          ) : null}
        </div>
        <dl className="traditional-mode-banner__summary" aria-label="Сводка подборки">
          <div><dt>Колод</dt><dd>{data.stats.total || '—'}</dd></div>
          <div><dt>Стандарт / Вольный</dt><dd>{data.stats.standard || '—'} / {data.stats.wild || '—'}</dd></div>
        </dl>
      </header>

      <section
        className="fun-decks-method"
        aria-labelledby="fun-decks-method-title"
        data-tour-id="fun-decks-method"
      >
        <div className="fun-decks-method__intro">
          <span>Как читаются оценки</span>
          <h2 id="fun-decks-method-title">Почему колода считается фановой</h2>
          <p>Обе оценки пересчитываются автоматически при обновлении подборки.</p>
        </div>
        <dl className="fun-decks-method__scores">
          <div>
            <dt>Не похожа на мету</dt>
            <dd>
              <strong>100% − сходство с ближайшей мета-колодой</strong>
              <span>
                Состав сравнивается по картам и их количеству с колодами того же
                формата и класса. Чем меньше общих карт, тем выше процент.
              </span>
            </dd>
          </div>
          <div>
            <dt>Индекс фана</dt>
            <dd>
              <strong>Дистанция от меты + необычность идеи</strong>
              <span>
                Основа — 55% от дистанции до меты. Баллы добавляют редкие сочетания
                карт и нестандартная концепция, а популярные ладдерные архетипы снижают оценку.
              </span>
            </dd>
          </div>
        </dl>
        <p className="fun-decks-method__gate">
          В подборку проходят колоды с индексом от {score(data.methodology?.minFunScore ?? 0.55)}
          {' '}и сходством с метой не выше {score(data.methodology?.maxMetaSimilarity ?? 0.42)}.
        </p>
      </section>

      <section
        className="fun-decks-tools"
        aria-label="Фильтры фан-колод"
        data-tour-id="fun-decks-filters"
      >
        <div className="fun-decks-tools__formats" role="group" aria-label="Формат">
          {filterButtons.map(filter => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={formatFilter === filter.id}
              onClick={() => {
                setFormatFilter(filter.id);
                setVisibleCount(6);
              }}
            >
              {filter.label}
              <span>{filter.count}</span>
            </button>
          ))}
        </div>
        <label className="fun-decks-tools__search">
          <Search aria-hidden="true" />
          <span className="sr-only">Найти колоду или класс</span>
          <input
            type="search"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setVisibleCount(6);
            }}
            placeholder="Найти колоду или класс"
          />
        </label>
        <label className="fun-decks-tools__sort">
          <span>Сначала</span>
          <select
            value={sortMode}
            onChange={event => {
              setSortMode(event.target.value as SortMode);
              setVisibleCount(6);
            }}
          >
            <option value="newest">Новые</option>
            <option value="fun">Самые необычные</option>
          </select>
        </label>
      </section>

      {loading ? (
        <section className="fun-decks-page__state" aria-busy="true">
          <RefreshCw className="fun-decks-page__spinner" aria-hidden="true" />
          <h2>Собираем фан-колоды</h2>
          <p>Загружаем свежую подборку и составы карт.</p>
        </section>
      ) : error ? (
        <section className="fun-decks-page__state fun-decks-page__state--error" role="alert">
          <TriangleAlert aria-hidden="true" />
          <h2>Подборка временно недоступна</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            Повторить
          </button>
        </section>
      ) : visibleDecks.length ? (
        <>
          <section className="fun-decks-grid" aria-label="Подборка фан-колод">
            {visibleDecks.map((deck, index) => (
              <React.Fragment key={`${deck.format}:${deck.deckCode}`}>
                <FunDeckCard
                  deck={deck}
                  fresh={isRecentlyAdded(deck, data.fetchedAt)}
                  tourAnchor={index === 0}
                />
              </React.Fragment>
            ))}
          </section>
          {hasFullAccess && visibleCount < filteredDecks.length ? (
            <div className="fun-decks-page__more">
              <button type="button" onClick={() => setVisibleCount(count => count + 6)}>
                Показать ещё
                <span>{filteredDecks.length - visibleCount}</span>
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <section className="fun-decks-page__state">
          <Search aria-hidden="true" />
          <h2>Колоды не найдены</h2>
          <p>Измените формат или очистите строку поиска.</p>
        </section>
      )}

      {!loading && !error && !hasFullAccess ? (
        <PaywallGate
          active
          presentation="inline"
          surface="meta"
          variant="standard"
          title="Откройте всю подборку фан-колод"
          description="Сейчас показаны три недавно добавленные колоды выбранного формата. Тариф «Алмаз» открывает всю подборку и новые сборки после каждого обновления."
          benefits={[
            'Все колоды Стандарта и Вольного',
            'Полные составы и коды для импорта',
            'Свежие стримерские и off-meta сборки',
          ]}
          providerButtons
          {...paywall}
        />
      ) : null}
    </div>
  );
}
