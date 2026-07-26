import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Clock3,
  ExternalLink,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';
import '../route-parchment.css';
import DeckListView from './decklist/DeckListView';
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

function metaDistance(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round((1 - Math.max(0, Math.min(1, value))) * 100)}%`;
}

function updateLabel(value: string | null): string {
  if (!value) return 'обновляется автоматически';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'обновляется автоматически';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function FunDeckCard({ deck, tourAnchor = false }: { deck: FunDeckRow; tourAnchor?: boolean }) {
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

  return (
    <article className="fun-deck-card">
      <header className="fun-deck-card__identity">
        <img src={classMeta.icon} alt="" width="64" height="64" loading="lazy" decoding="async" />
        <div>
          <span>{format === 'wild' ? 'Вольный формат' : 'Стандарт'}</span>
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
            showCopy
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
    const accessibleDecks = hasFullAccess
      ? formatDecks
      : [...formatDecks]
        .sort((left, right) => (right.funScore ?? 0) - (left.funScore ?? 0))
        .slice(0, FREE_PREVIEW_COUNT);
    return accessibleDecks.filter(deck => {
      if (!needle) return true;
      const classLabel = CLASS_META[normalizeClass(deck.className)]?.label || deck.className;
      return `${deck.title} ${classLabel} ${deck.streamer || ''} ${deck.nearestArchetype || ''}`
        .toLocaleLowerCase('ru-RU')
        .includes(needle);
    });
  }, [data.decks, deferredQuery, formatFilter, hasFullAccess]);

  const visibleDecks = filteredDecks.slice(0, visibleCount);
  const filterButtons: Array<{ id: FormatFilter; label: string; count: number }> = [
    { id: 'all', label: 'Все', count: data.stats.total },
    { id: 'standard', label: 'Стандарт', count: data.stats.standard },
    { id: 'wild', label: 'Вольный', count: data.stats.wild },
  ];

  return (
    <div className="fun-decks-page">
      <header className="fun-decks-hero">
        <div className="fun-decks-hero__copy">
          <span className="fun-decks-hero__eyebrow">
            <Sparkles aria-hidden="true" />
            Традиционный режим
          </span>
          <h1>Фан-колоды</h1>
          <p>
            Необычные сборки Стандарта и Вольного режима, которые заметно отличаются
            от популярных архетипов. Можно сразу посмотреть состав и скопировать код.
          </p>
        </div>
        <div className="fun-decks-hero__ledger" aria-label="Сводка подборки">
          <div><strong>{data.stats.total || '—'}</strong><span>колод в подборке</span></div>
          <div><strong>{data.stats.standard || '—'}</strong><span>в Стандарте</span></div>
          <div><strong>{data.stats.wild || '—'}</strong><span>в Вольном</span></div>
          <p><Clock3 aria-hidden="true" /> Обновлено {updateLabel(data.fetchedAt)}</p>
        </div>
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
              <FunDeckCard
                key={`${deck.format}:${deck.deckCode}`}
                deck={deck}
                tourAnchor={index === 0}
              />
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
          description="Сейчас показаны три самые необычные колоды выбранного формата. Тариф «Алмаз» открывает всю подборку и новые сборки после каждого обновления."
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
