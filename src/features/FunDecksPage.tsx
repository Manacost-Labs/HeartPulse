import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Copy,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react';
import '../route-parchment.css';
import DeckListView from './decklist/DeckListView';
import DeckRenderPreview from './deckrender/DeckRenderPreview';
import { useResolvedDeck } from './decklist/useResolvedDeck';
import {
  selectFunDecks,
  type FunDeckRow,
  type FunDeckTagId,
  type FunDecksPayload,
} from './funDecksPreview';
import { FunDeckMetrics, FunDeckWhy, FunDecksMethodGate } from './FunDeckFacts';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './FunDecksPage.css';
import { FunDecksSkeleton } from './FunDecksSkeleton';
import { FunDecksFilters } from './FunDecksFilters';
import { useFunDecksFilters } from './useFunDecksFilters';
import { useFunDeckCardPreview } from './funDecks/useFunDeckCardPreview';
import { useNearScreen } from './funDecks/useNearScreen';
import { funDeckClassMeta, funDeckFormat, funDeckFormatLabel } from './funDecks/deckMeta';
import { useCopyDeckCode } from './funDecks/useCopyDeckCode';
import { DeckLayoutSwitch, useDeckLayout, type DeckLayout } from './deckViews/DeckLayoutSwitch';
import { FunDeckRowCard } from './funDecks/FunDeckRowCard';
import { FunDeckTilesCard } from './funDecks/FunDeckTilesCard';

const EMPTY_DATA: FunDecksPayload = {
  fetchedAt: null,
  stats: { total: 0, standard: 0, wild: 0 },
  methodology: { detectorVersion: null, minFunScore: null, maxMetaSimilarity: null, ladderMemberSim: null },
  decks: [],
};

function timestamp(value: string | null): number {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecentlyAdded(deck: FunDeckRow, fetchedAt: string | null): boolean {
  const firstSeen = timestamp(deck.firstSeenAt);
  const reference = timestamp(fetchedAt) || Date.now();
  return firstSeen > 0 && firstSeen >= reference - 72 * 60 * 60 * 1_000;
}

/** The «Картинки» view: the Deckview picture of the deck, as the page showed it before. */
function FunDeckCard({
  deck,
  fresh = false,
  tourAnchor = false,
  eager = false,
  pinnedTags = [],
}: {
  deck: FunDeckRow;
  fresh?: boolean;
  tourAnchor?: boolean;
  eager?: boolean;
  /** Tags the reader filters by: the card shows them first. */
  pinnedTags?: readonly FunDeckTagId[];
}) {
  const format = funDeckFormat(deck);
  const { ref, near } = useNearScreen<HTMLElement>(eager);
  const { data, error, reload } = useResolvedDeck(deck.deckCode, {
    format,
    archetype: deck.nearestArchetype || undefined,
    enabled: near,
  });
  const classMeta = funDeckClassMeta(deck, data?.heroDbfId);
  const { state: copyState, label: copyLabel, copy: copyDeckCode } = useCopyDeckCode(deck.deckCode);

  return (
    <article className="fun-deck-card" ref={ref}>
      <header className="fun-deck-card__identity">
        <img src={classMeta.icon} alt="" width="64" height="64" loading="lazy" decoding="async" />
        <div>
          <span>
            {funDeckFormatLabel(deck)}
            {fresh ? <strong>Новая</strong> : null}
          </span>
          <h2>{deck.title}</h2>
          <p>{classMeta.label}{deck.streamer ? ` · ${deck.streamer}` : ''}</p>
        </div>
      </header>

      <FunDeckWhy deck={deck} pinnedTags={pinnedTags} />

      <FunDeckMetrics deck={deck} tourAnchor={tourAnchor} />

      <div
        className="fun-deck-card__deck"
        data-tour-id={tourAnchor ? 'fun-decks-deck-list' : undefined}
        style={{ ['--fun-deck-class' as string]: classMeta.color }}
      >
        <DeckRenderPreview
          deckCode={deck.deckCode}
          deckName={deck.title}
          eager={eager}
          initialAsset={deck.render || null}
        >
          {data ? (
            <DeckListView
              cards={data.cards}
              sideboards={data.sideboards}
              title={classMeta.label}
              subtitle={funDeckFormatLabel(deck)}
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
            <LoadingSurface label="Загружаем состав колоды" quiet layout="rows"
              className="fun-deck-card__deck-state" blocksClassName="fun-deck-card__deck-skeletons">
              {Array.from({ length: 10 }, (_, index) => <LoadingBlock key={index} className="fun-deck-card__deck-skeleton" />)}
            </LoadingSurface>
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
    </article>
  );
}

const DECK_VIEWS: Record<DeckLayout, { className: string; Card: typeof FunDeckCard }> = {
  tiles: { className: 'fun-decks-tiles-grid', Card: FunDeckTilesCard },
  rows: { className: 'fun-decks-rows', Card: FunDeckRowCard },
  images: { className: 'fun-decks-grid', Card: FunDeckCard },
};

function decksWord(count: number): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return 'колод';
  if (units === 1) return 'колода';
  return units >= 2 && units <= 4 ? 'колоды' : 'колод';
}

/**
 * The selection: a server-rendered guest preview shows at once, and the
 * complete list, which filters and subscribers need, loads behind it
 * without a loader. Only a page without a preview starts with the loader.
 */
function useFunDecksData(initialPreview: FunDecksPayload | null) {
  const [data, setData] = useState<FunDecksPayload>(initialPreview ?? EMPTY_DATA);
  const [loading, setLoading] = useState(!initialPreview);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      // A stalled request ends at the shared deadline in the error state with its retry.
      const response = await fetchWithDeadline('/api/fun-decks', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить подборку');
      setData(payload as FunDecksPayload);
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить подборку');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const retry = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);
  return { data, loading, complete, error, retry };
}

export default function FunDecksPage({
  initialPreview = null,
  openDecks,
}: {
  /** The selection read on the server (apps/public-web/lib/publicFunDecksPreview.ts): every deck, for every viewer. */
  initialPreview?: FunDecksPayload | null;
  /** The server-rendered list of those decks with their cards and codes; it stays until the interactive view has real decks to replace it. */
  openDecks?: ReactNode;
}) {
  const { data, loading, complete, error: loadError, retry } = useFunDecksData(initialPreview);
  // A failed refresh keeps the preview the page already has.
  const error = loadError && !data.decks.length ? loadError : '';
  const [arrivesLater] = useState(!initialPreview || openDecks !== undefined);
  const { filters, query, view, filtered, change, search, reset } = useFunDecksFilters();
  const { listeners: previewListeners, tooltip: cardPreview } = useFunDeckCardPreview();
  const [layout, setLayout] = useDeckLayout();
  const deckView = DECK_VIEWS[layout];
  const filteredDecks = useMemo(
    () => selectFunDecks(data.decks, view),
    [data.decks, view],
  );
  // Until the complete list arrives, only the guest preview is at hand: a filter or a sort from the link would show a wrong answer on it.
  const settling = !complete && !loadError
    && (filters.format !== 'all' || filters.classes.length > 0 || filters.tags.length > 0 || filters.sort !== 'newest');

  const visibleDecks = filteredDecks;
  // The server list holds the page until the full answer arrives with decks in it, then the interactive view takes its place in one render.
  const showOpen = openDecks !== undefined && !(complete && data.decks.length > 0) && !loadError && !settling;

  return (
    <div className="fun-decks-page">
      <header className="traditional-mode-banner">
        <div className="traditional-mode-banner__copy">
          <h1>Фан-колоды</h1>
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
        </div>
        <dl className="fun-decks-method__scores">
          <div>
            <dt>Не похожа на мету</dt>
            <dd>
              <strong>100% − сходство с ближайшим ладдерным списком</strong>
              <span>
                Список сравнивается по картам с колодами того же формата и класса.
                Чем меньше общих карт, тем выше процент.
              </span>
            </dd>
          </div>
          <div>
            <dt>Индекс фана</dt>
            <dd>
              <strong>Дальность от лестницы + необычность идеи</strong>
              <span>
                Растёт, если колода далека от ладдерных списков, а в ней есть концепт
                в названии, острый пакет карт или уникальный список.
              </span>
            </dd>
          </div>
        </dl>
        <FunDecksMethodGate methodology={data.methodology} />
      </section>

      <FunDecksFilters
        filters={filters}
        query={query}
        counts={{ all: data.stats.total, standard: data.stats.standard, wild: data.stats.wild }}
        filtered={filtered}
        resultText={filtered && !loading && !settling && !error ? `Найдено: ${filteredDecks.length}` : ''}
        onChange={change}
        onSearch={search}
        onReset={reset}
      />

      {!error && !showOpen && (loading || settling || visibleDecks.length) ? (
        <div className="fun-decks-layout-bar">
          <p>{loading || settling ? '\u00a0' : `${filteredDecks.length} ${decksWord(filteredDecks.length)}`}</p>
          <DeckLayoutSwitch layout={layout} onChange={setLayout} />
        </div>
      ) : null}

      {showOpen ? openDecks : loading || settling ? (
        <FunDecksSkeleton layout={layout} />
      ) : error ? (
        <section className="fun-decks-page__state fun-decks-page__state--error" role="alert">
          <TriangleAlert aria-hidden="true" />
          <h2>Подборка временно недоступна</h2>
          <p>{error}</p>
          <button type="button" onClick={retry}>
            <RefreshCw aria-hidden="true" />
            Повторить
          </button>
        </section>
      ) : visibleDecks.length ? (
        <>
          <section className={`${deckView.className} data-surface${arrivesLater ? ' data-arrive' : ''}`} aria-label="Подборка фан-колод"
            aria-busy={!complete} {...previewListeners}>
            {visibleDecks.map((deck, index) => (
              <React.Fragment key={`${deck.format}:${deck.deckCode}`}>
                <deckView.Card
                  deck={deck}
                  fresh={isRecentlyAdded(deck, data.fetchedAt)}
                  tourAnchor={index === 0}
                  pinnedTags={filters.tags}
                  // The deck images are in the server HTML: only the first,
                  // in view on every screen, loads with it; the rest wait for
                  // the viewport instead of taking a phone's bandwidth from
                  // the page scripts.
                  eager={index === 0}
                />
              </React.Fragment>
            ))}
          </section>
          {cardPreview}
        </>
      ) : (
        <section className="fun-decks-page__state">
          <Search aria-hidden="true" />
          <h2>Колоды не найдены</h2>
          <p>
            {!filtered ? 'Подборка пока пуста.' : 'Ни одна колода не подходит под выбранные фильтры.'}
          </p>
          {filtered ? (
            <button type="button" onClick={reset}>
              <RefreshCw aria-hidden="true" />
              Сбросить фильтры
            </button>
          ) : null}
        </section>
      )}
    </div>
  );
}
