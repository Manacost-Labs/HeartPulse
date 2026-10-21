import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Copy,
  Crown,
  Download,
  Gem,
  LayoutGrid,
  Maximize2,
  RefreshCw,
  Search,
  ShieldCheck,
  Swords,
  TableProperties,
  Trophy,
  X,
} from 'lucide-react';
import ModalSurface from '../components/ModalSurface/ModalSurface';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';
import { StandardMetaSearchIntro } from '../modules/searchLanding/public';
import { AsyncSurfaceState, RecoverableSurfaceBoundary } from './recovery/RecoverableSurface';
import { datasetContractErrorMessage } from '../../shared/datasetEnvelope';
import {
  STANDARD_META_MEDIA_TYPE,
  parseStandardMetaApiResponse,
  type StandardMetaPeriod,
} from '../../shared/standardMetaContract';
import { STANDARD_META_ROLLING_PERIODS } from '../../shared/standardMetaPeriods';
import DeckListView, { type DeckListCard } from './decklist/DeckListView';
import {
  orderStandardMetaPeriods,
  resolveStandardMetaDefaultPeriod,
  standardMetaPeriodLabel,
} from './standardMetaFilterModel';
import StandardMetaChart from './StandardMetaChart';
import { STANDARD_META_CLASS_COLORS, standardMetaClassIcon } from './standardMetaClassModel';
import { metaRequestKey, teaserSeedKey, TEASER_SEED_FILTERS, type StandardMetaTeaserSeed } from './standardMetaTeaser';
import '../route-parchment.css';
import './recovery/RecoverableSurface.css';
import '../shared/ui/LoadingSurface.css';
import './StandardMeta.css';
import { ViewSwitch } from '../components/transitions/ViewSwitch';
import { MODE_ORDER } from '../components/transitions/transitionOrder';
type MetaFormat = 'standard' | 'wild';
type MetaRank = 'all' | 'diamond' | 'diamond_legend' | 'legend'
  | 'top_5k' | 'top_legend';
type MetaPeriod = StandardMetaPeriod;
type MetaCoin = 'any_player';
type MetaMinGames = 100 | 250 | 500 | 1000 | 2500 | 5000;
type MetaView = 'cards' | 'tiers' | 'table';
/** The order of the view buttons; a format changes when its slice arrives (`data.format`). */
const META_VIEWS: readonly MetaView[] = ['cards', 'tiers', 'table'];
type MetaClass = 'deathknight' | 'demonhunter' | 'druid' | 'hunter' | 'mage' | 'paladin' | 'priest' | 'rogue' | 'shaman' | 'warlock' | 'warrior';

type MetaItem = {
  id: string;
  slug: string;
  archetype: string;
  archetypeLabel: string;
  translated: boolean;
  classKey: MetaClass | null;
  winrate: number | null;
  popularity: number | null;
  games: number | null;
  turns: number | null;
  durationMinutes: number | null;
  climbingSpeed: number | null;
};

type MetaPayload = {
  format: MetaFormat;
  formatLabel: string;
  rank: MetaRank;
  rankLabel: string;
  period: MetaPeriod;
  availablePeriods: MetaPeriod[];
  currentPeriod: MetaPeriod | null;
  currentPatchPeriod: MetaPeriod | null;
  coin: MetaCoin;
  minGames: MetaMinGames;
  source: string;
  sourceUrl: string;
  translationSource: string;
  updatedAt: string | null;
  items: MetaItem[];
};

type Recommendation = {
  archetype: string;
  archetypeLabel: string;
  deckCode: string;
  format: MetaFormat;
  rank: MetaRank;
  source: string;
  sourceUrl: string;
  streamer: string | null;
  sampleGames: number | null;
  winrate: number | null;
  updatedAt: string | null;
  classKey: MetaClass;
  matchedArchetype: string;
  matchMethod: 'exact' | 'alias';
  deckCards: DeckListCard[];
};

type Preview = {
  hash: string;
  state: string;
  ready: boolean;
  imageUrl: string | null;
  error: string | null;
};

type DeckModalState = {
  item: MetaItem;
  recommendation: Recommendation | null;
  preview: Preview | null;
  loadingRecommendation: boolean;
  loadingPreview: boolean;
  error: string;
  previewError: string;
};

const FORMATS: Array<{ id: MetaFormat; label: string; description: string; asset: string }> = [
  {
    id: 'standard',
    label: 'Стандарт',
    description: 'Текущая ротация',
    asset: '/card-format-standard.webp',
  },
  {
    id: 'wild',
    label: 'Вольный',
    description: 'Все дополнения',
    asset: '/assets/card-format-wild-128.webp',
  },
];

const RANKS: Array<{ id: MetaRank; label: string }> = [
  { id: 'diamond', label: 'Алмаз 1–4' },
  { id: 'diamond_legend', label: 'Алмаз — Легенда' },
  { id: 'legend', label: 'Легенда' },
  { id: 'top_5k', label: 'Топ-5000' },
  { id: 'top_legend', label: 'Топ-1000' },
];

const RANK_GROUPS: Array<{ label: string; icon: typeof Gem; ranks: MetaRank[] }> = [
  { label: 'Алмаз', icon: Gem, ranks: ['diamond', 'diamond_legend'] },
  { label: 'Легенда', icon: Crown, ranks: ['legend', 'top_5k', 'top_legend'] },
];

const MIN_GAMES: MetaMinGames[] = [100, 250, 500, 1000, 2500, 5000];
const DECK_CLASS_COLORS: Record<MetaClass, string> = STANDARD_META_CLASS_COLORS;
// The table (with VaryloUI's sparkline) and the tier groups (with the tier
// badge) load when a reader opens that view, never with the first paint.
const StandardMetaArchetypeTable = React.lazy(() => import('./StandardMetaArchetypeTable'));
const StandardMetaTierGroups = React.lazy(() => import('./StandardMetaTierGroups'));

const EMPTY_DATA: MetaPayload = {
  format: 'standard',
  formatLabel: 'Стандарт',
  rank: 'diamond_legend',
  rankLabel: 'Алмаз — Легенда',
  period: 'past_day',
  availablePeriods: [...STANDARD_META_ROLLING_PERIODS],
  currentPeriod: null,
  currentPatchPeriod: null,
  coin: 'any_player',
  minGames: 100,
  source: 'hsguru',
  sourceUrl: '',
  translationSource: '',
  updatedAt: null,
  items: [],
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Сервер временно недоступен');
    if (response.status === 401 || response.status === 403) error.name = 'MetaAccessDenied';
    throw error;
  }
  return payload as T;
}

function formatNumber(value: number | null, suffix = ''): string {
  if (value === null) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}${suffix}`;
}

function winrateTone(value: number | null): 'neutral' | 'strong' | 'even' | 'weak' {
  return value === null ? 'neutral' : value >= 52 ? 'strong' : value >= 49 ? 'even' : 'weak';
}

const classIcon = standardMetaClassIcon;

function WinrateMedallion({ value }: { value: number | null }) {
  const tone = winrateTone(value);
  return (
    <div className={`standard-meta__winrate standard-meta__winrate--${tone}`} aria-label={`Винрейт ${formatNumber(value, '%')}`}>
      <strong>{formatNumber(value, '%')}</strong>
      <span>винрейт</span>
    </div>
  );
}

/** The view switch and, for the table, its CSV download; the export code loads on the first click. */
function MetaViewActions({ view, onView, tableRef, csvTitle }: {
  view: MetaView;
  onView: (view: MetaView) => void;
  tableRef: React.RefObject<HTMLTableElement | null>;
  csvTitle: string;
}) {
  const [error, setError] = useState('');
  const download = () => {
    const table = tableRef.current;
    if (!table) return;
    setError('');
    import('../shared/ui/analytics/chartExport')
      .then(exporter => exporter.downloadTableCsv(table, csvTitle))
      .catch(() => setError('Не удалось скачать таблицу. Попробуйте ещё раз.'));
  };
  return (
    <div className="standard-meta__view-actions">
      <div className="standard-meta__view-switch" aria-label="Вид списка" data-tour-id="meta-view-switcher">
        <button type="button" data-meta-view="cards" aria-pressed={view === 'cards'} onClick={() => onView('cards')}>
          <LayoutGrid size={17} /> Карточки
        </button>
        <button type="button" data-meta-view="tiers" aria-pressed={view === 'tiers'} onClick={() => onView('tiers')}>
          <Trophy size={17} /> Тиры
        </button>
        <button type="button" data-meta-view="table" aria-pressed={view === 'table'} onClick={() => onView('table')}>
          <TableProperties size={17} /> Таблица
        </button>
      </div>
      {view === 'table' && (
        <button type="button" className="standard-meta__csv" aria-label="Скачать таблицу в CSV" title="Скачать CSV" onClick={download}>
          <Download size={17} aria-hidden="true" />
        </button>
      )}
      {view === 'table' && error && <p className="standard-meta__csv-error" role="alert">{error}</p>}
    </div>
  );
}

export function DeckModal({ state, onClose, onRenderPreview }: { state: DeckModalState; onClose: () => void; onRenderPreview: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const autoPreviewKeyRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);
  const deckCards = state.recommendation?.deckCards ?? [];
  const deckTotal = deckCards.reduce((sum, card) => sum + card.count, 0);
  const deckLimit = deckTotal > 30 ? 40 : 30;
  const deckClass = state.recommendation?.classKey ?? state.item.classKey;
  const deckClassColor = deckClass ? DECK_CLASS_COLORS[deckClass] : '#4b5560';

  useEffect(() => {
    const deckCode = state.recommendation?.deckCode ?? null;
    if (deckCode && autoPreviewKeyRef.current !== deckCode && !state.preview && !state.loadingPreview && !state.previewError) {
      autoPreviewKeyRef.current = deckCode;
      onRenderPreview();
    }
  }, [
    onRenderPreview,
    state.loadingPreview,
    state.preview,
    state.previewError,
    state.recommendation?.deckCode,
  ]);

  const copyDeck = async () => {
    if (!state.recommendation?.deckCode) return;
    const deckCode = state.recommendation.deckCode;
    let didCopy = false;
    try {
      await navigator.clipboard.writeText(deckCode);
      didCopy = true;
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = deckCode;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      didCopy = document.execCommand('copy');
      fallback.remove();
    }
    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <ModalSurface
      className="standard-meta-modal"
      panelClassName="standard-meta-modal__panel"
      backdropClassName="standard-meta-modal__backdrop"
      ariaLabelledBy="standard-meta-deck-title"
      closeLabel="Закрыть окно сборки"
      initialFocusRef={closeRef}
      onClose={onClose}
    >
        <button ref={closeRef} type="button" className="standard-meta-modal__close" onClick={onClose} aria-label="Закрыть окно">
          <X size={22} />
        </button>

        <header className="standard-meta-modal__header">
          <img src={classIcon(state.recommendation?.classKey ?? state.item.classKey)} alt="" width="64" height="64" decoding="async" />
          <div>
            <span className="standard-meta__eyebrow">РЕКОМЕНДУЕМАЯ СБОРКА · BETA</span>
            <h2 id="standard-meta-deck-title">{state.item.archetypeLabel}</h2>
            <p>{state.item.archetype}</p>
          </div>
        </header>

        {state.loadingRecommendation && (
          <div className="standard-meta-modal__status standard-meta-modal__status--full" role="status">
            <RefreshCw className="standard-meta__spinner" size={30} />
            <strong>Подбираем свежую сборку</strong>
            <span>Сравниваем доступные колоды и размер выборки.</span>
          </div>
        )}

        {!state.loadingRecommendation && state.error && (
          <div className="standard-meta-modal__status standard-meta-modal__status--warning standard-meta-modal__status--full" role="alert">
            <AlertTriangle size={30} />
            <strong>Сборка пока не найдена</strong>
            <span>{state.error}</span>
          </div>
        )}

        {state.recommendation && (
          <div className="standard-meta-modal__content">
            <div className="standard-meta-modal__deck-meta">
              {state.recommendation.streamer && <span><Trophy size={15} /> {state.recommendation.streamer}</span>}
              {state.recommendation.sampleGames !== null && <span>{state.recommendation.sampleGames.toLocaleString('ru-RU')} игр</span>}
              {state.recommendation.winrate !== null && <span>{formatNumber(state.recommendation.winrate, '%')} WR</span>}
            </div>
            <div className="standard-meta-modal__workspace">
              <section className="standard-meta-modal__visual-pane" aria-label="Изображение колоды">
                <div className="standard-meta-modal__image-stage">
                  {state.preview?.ready && state.preview.imageUrl ? (
                    <a href={state.preview.imageUrl} target="_blank" rel="noreferrer" className="standard-meta-modal__image-link" aria-label="Открыть изображение колоды в полном размере">
                      <img src={state.preview.imageUrl} alt={`Колода ${state.item.archetypeLabel}`} decoding="async" />
                      <span><Maximize2 size={16} /> Полный размер</span>
                    </a>
                  ) : state.loadingPreview || (state.preview && !state.preview.ready && state.preview.state !== 'error') ? (
                    <div className="standard-meta-modal__status" role="status">
                      <RefreshCw className="standard-meta__spinner" size={30} />
                      <strong>DeckView рисует колоду</strong>
                      <span>Окно обновится автоматически.</span>
                    </div>
                  ) : (
                    <div className="standard-meta-modal__status standard-meta-modal__status--warning">
                      <AlertTriangle size={30} />
                      <strong>Изображение пока недоступно</strong>
                      <span>{state.previewError || state.preview?.error || 'Код колоды уже можно скопировать.'}</span>
                      <button type="button" onClick={onRenderPreview}><RefreshCw size={16} /> Повторить</button>
                    </div>
                  )}
                </div>

                <div className="standard-meta-modal__actions">
                  <button
                    type="button"
                    className={`standard-meta-modal__copy-button${copied ? ' standard-meta-modal__copy-button--copied' : ''}`}
                    onClick={copyDeck}
                    aria-label={copied ? 'Код колоды скопирован' : 'Скопировать код колоды'}
                  >
                    {copied ? <ShieldCheck size={19} aria-hidden="true" /> : <Copy size={19} aria-hidden="true" />}
                    <span className="standard-meta-modal__copy-feedback" aria-live="polite">
                      {copied ? 'Код скопирован' : 'Скопировать код'}
                    </span>
                  </button>
                </div>
              </section>

              <section className="standard-meta-modal__composition-pane" aria-label="Состав колоды" tabIndex={0}>
                <div className="standard-meta-modal__builder-deck">
                  <DeckListView
                    cards={deckCards}
                    title={state.item.archetypeLabel}
                    subtitle="Состав из конструктора колод"
                    headerColor={deckClassColor}
                    totalCards={deckTotal}
                    deckSizeLimit={deckLimit}
                    emptyText="Состав колоды обновляется."
                  />
                </div>
              </section>
            </div>
          </div>
        )}
    </ModalSurface>
  );
}

const DEFAULT_PAYWALL_ACCESS: PaywallAccessState = {
  authUser: null,
  subscriptionStatus: null,
  subscriptionLoading: false,
  onRefreshSubscription: async () => null,
};

type StandardMetaPageProps = {
  hasFullAccess?: boolean;
  accessPending?: boolean;
  /** The browser holds a session whose access is still checked: no teaser request until it is known. */
  teaserWaitsForAccess?: boolean;
  paywall?: PaywallAccessState;
  embedded?: boolean;
  initialTeaser?: StandardMetaTeaserSeed | null;
};

function StandardMetaContent({
  hasFullAccess,
  accessPending, teaserWaitsForAccess,
  paywall,
  initialTeaser,
}: Required<Omit<StandardMetaPageProps, 'embedded'>>) {
  const [format, setFormat] = useState<MetaFormat>(TEASER_SEED_FILTERS.format);
  const [rank, setRank] = useState<MetaRank>(TEASER_SEED_FILTERS.rank);
  const [period, setPeriod] = useState<MetaPeriod | null>(initialTeaser?.period ?? null);
  const coin: MetaCoin = 'any_player';
  const [minGames, setMinGames] = useState<MetaMinGames>(TEASER_SEED_FILTERS.minGames);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [view, setView] = useState<MetaView>('cards');
  const tableRef = useRef<HTMLTableElement>(null);
  // A subscriber's page starts from the teaser too, busy until the full slice replaces it.
  const [data, setData] = useState<MetaPayload>(initialTeaser?.data ?? EMPTY_DATA);
  const hasPayload = data !== EMPTY_DATA;
  // The teaser's top-three totals are not a subscriber's numbers: a dash until the full slice lands.
  const summaryReady = hasPayload && !(hasFullAccess && data === initialTeaser?.data);
  const [arrivesLater] = useState(!initialTeaser);
  const [metaRevision, setMetaRevision] = useState(0);
  const requestKey = metaRequestKey(format, rank, period, minGames, metaRevision, hasFullAccess);
  const seedKey = teaserSeedKey(initialTeaser, hasFullAccess);
  const answeredKey = useRef(seedKey);
  const [resolvedRequestKey, setResolvedRequestKey] = useState(seedKey);
  const [requestError, setRequestError] = useState<{ key: string; message: string } | null>(null);
  const loading = resolvedRequestKey !== requestKey;
  const error = requestError?.key === requestKey ? requestError.message : '';
  const requestId = useRef(0);

  useEffect(() => {
    // The server-rendered teaser answers the guest's first slice. Without it a
    // guest reads the teaser at once, but a browser holding a session waits for
    // its access check: full access remounts the page and would abort a teaser
    // in flight. The request starts a microtask later, so a remembered
    // subscriber's access, applied right after hydration, cancels it unsent.
    // A session without a readable tag (signed in before tags) is not told
    // apart from a guest: a teaser already sent is not aborted when full access
    // remounts the page (the browser would report a failed request); its
    // answer is dropped instead.
    if (requestKey === answeredKey.current || teaserWaitsForAccess) return undefined;
    answeredKey.current = '';
    const currentRequest = ++requestId.current;
    const controller = new AbortController();
    let redirectedToCurrentPeriod = false;
    const params = new URLSearchParams({
      format,
      rank,
      coin,
      min_games: String(minGames),
    });
    if (period) params.set('period', period);
    const endpoint = hasFullAccess ? '/api/standard-meta' : '/api/standard-meta/teaser';
    void Promise.resolve().then(() => controller.signal.aborted ? Promise.reject(new DOMException('', 'AbortError'))
      : apiJson<unknown>(`${endpoint}?${params}`, {
        signal: hasFullAccess ? controller.signal : undefined,
        headers: { Accept: STANDARD_META_MEDIA_TYPE },
      }))
      .then(payload => {
        const verified = parseStandardMetaApiResponse(payload);
        if (currentRequest === requestId.current && !controller.signal.aborted) {
          const defaultPeriod = resolveStandardMetaDefaultPeriod(
            verified.data.availablePeriods,
            verified.data.currentPeriod,
            verified.data.currentPatchPeriod,
          );
          if (!period && defaultPeriod) {
            redirectedToCurrentPeriod = true;
            setPeriod(defaultPeriod);
            return;
          }
          if (!period) setPeriod(verified.data.period);
          setData(verified.data);
        }
      })
      .catch(cause => {
        if ((cause instanceof DOMException && cause.name === 'AbortError') || controller.signal.aborted) return;
        if (currentRequest === requestId.current) {
          if (cause instanceof Error && cause.name === 'MetaAccessDenied') setData(EMPTY_DATA);
          setRequestError({ key: requestKey, message: datasetContractErrorMessage(cause) });
        }
      })
      .finally(() => {
        if (currentRequest === requestId.current && !redirectedToCurrentPeriod) {
          setResolvedRequestKey(requestKey);
        }
      });
    return () => controller.abort();
  }, [format, rank, period, minGames, metaRevision, hasFullAccess, teaserWaitsForAccess, requestKey]);

  const filteredItems = useMemo(() => {
    const normalized = deferredQuery.toLowerCase().trim();
    if (!normalized) return data.items;
    return data.items.filter(item => `${item.archetype} ${item.archetypeLabel}`.toLowerCase().includes(normalized));
  }, [data.items, deferredQuery]);
  const visibleItems = useMemo(
    () => hasFullAccess ? filteredItems : filteredItems.slice(0, 3),
    [filteredItems, hasFullAccess],
  );
  const rankById = useMemo(
    () => new Map(data.items.map((item, index) => [item.id, index + 1])),
    [data.items],
  );
  const periodOptions = useMemo(
    () => orderStandardMetaPeriods(data.availablePeriods, data.currentPeriod, data.currentPatchPeriod)
      .map(id => ({ id, label: standardMetaPeriodLabel(id) })),
    [data.availablePeriods, data.currentPeriod, data.currentPatchPeriod],
  );
  const selectedPeriod = period ?? data.currentPeriod ?? data.currentPatchPeriod ?? data.period;

  const archetypeHref = (item: MetaItem) => canonicalPagePath(`/standard/archetypes/${format}/${item.slug}`);

  return (
    <>
      <section className="traditional-mode-banner">
        <StandardMetaSearchIntro />
        <dl className="traditional-mode-banner__summary" aria-label="Сводка меты">
          <div><dt>{hasFullAccess ? 'Архетипов' : 'В предпросмотре'}</dt><dd>{summaryReady ? data.items.length : '—'}</dd></div>
          <div><dt>Игр в выборке</dt><dd>{summaryReady ? data.items.reduce((sum, item) => sum + (item.games ?? 0), 0).toLocaleString('ru-RU') : '—'}</dd></div>
        </dl>
      </section>

      <section className="standard-meta__controls" aria-label="Фильтры меты" data-page-still data-tour-id="meta-filters">
        <div className="standard-meta__panel-heading">
          <span aria-hidden="true"><Swords size={18} /></span>
          <div><strong>Управление срезом</strong><small>Выберите формат, рейтинг и временной диапазон</small></div>
        </div>
        <div className="standard-meta__format-control">
          <span className="standard-meta__control-label">Формат</span>
          <div className="standard-meta__segmented">
            {FORMATS.map(option => {
              return (
                <button key={option.id} type="button" aria-pressed={format === option.id} onClick={() => setFormat(option.id)}>
                  <img src={option.asset} alt="" width="32" height="36" aria-hidden="true" />
                  <span><strong>{option.label}</strong><small>{option.description}</small></span>
                </button>
              );
            })}
          </div>
        </div>
        <div data-tour-id="meta-controls">
          <span className="standard-meta__control-label">Рейтинг</span>
          <div className="standard-meta__rank-groups">
            {RANK_GROUPS.map(group => {
              const GroupIcon = group.icon;
              return (
                <div className="standard-meta__rank-group" key={group.label}>
                  <span><GroupIcon size={14} aria-hidden="true" />{group.label}</span>
                  <fieldset className="standard-meta__rank-tabs">
                    <legend className="sr-only">{`Ранги: ${group.label}`}</legend>
                    {group.ranks.map(rankId => {
                      const option = RANKS.find(candidate => candidate.id === rankId)!;
                      return (
                        <button key={option.id} type="button" aria-pressed={rank === option.id} onClick={() => setRank(option.id)}>
                          {option.label}
                        </button>
                      );
                    })}
                  </fieldset>
                </div>
              );
            })}
          </div>
          <select
            className="standard-meta__rank-select"
            value={rank}
            onChange={event => setRank(event.target.value as MetaRank)}
            aria-label="Рейтинг"
          >
            {RANKS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
        <div className="standard-meta__secondary-filters">
          <label className="standard-meta__select">
            <span className="standard-meta__control-label">Период</span>
            <select value={selectedPeriod} onChange={event => setPeriod(event.target.value as MetaPeriod)}>
              {periodOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="standard-meta__select">
            <span className="standard-meta__control-label">Минимум игр</span>
            <select value={minGames} onChange={event => setMinGames(Number(event.target.value) as MetaMinGames)}>
              {MIN_GAMES.map(value => <option key={value} value={value}>{value.toLocaleString('ru-RU')}</option>)}
            </select>
          </label>
          <label className="standard-meta__search" data-tour-id="meta-search">
            <Search size={18} />
            <span className="sr-only">Поиск архетипа</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти архетип…" />
          </label>
        </div>
      </section>

      {loading && !hasPayload && (
        <AsyncSurfaceState
          variant="loading"
          title="Загружаем мету"
          message="Получаем актуальный срез архетипов и статистики."
        />
      )}
      {!loading && error && (
        <AsyncSurfaceState
          variant="error"
          title="Не удалось загрузить мету"
          message={error}
          actionLabel="Повторить"
          onAction={() => setMetaRevision(revision => revision + 1)}
        />
      )}
      {!loading && !error && data.items.length === 0 && (
        <AsyncSurfaceState
          variant="empty"
          title="В этом срезе пока нет архетипов"
          message="Попробуйте другой формат или рейтинг. Данные появятся после следующего обновления источника."
        />
      )}
      {(!loading || hasPayload) && !error && data.items.length > 0 && (
        <div className={`standard-meta__results data-surface${arrivesLater ? ' data-arrive' : ''}`} aria-busy={loading}>
          <StandardMetaChart
            items={visibleItems}
            format={format}
            formatLabel={data.formatLabel}
            rankLabel={data.rankLabel}
          />

          <section className="standard-meta__results-toolbar" aria-label="Представление меты">
            <p data-tour-id="meta-results">
              <strong>{visibleItems.length}</strong> {hasFullAccess ? 'архетипов в текущем срезе' : 'лидера текущего среза'}
            </p>
            <MetaViewActions view={view} onView={setView} tableRef={tableRef} csvTitle={`Мета ${data.formatLabel}, ${data.rankLabel}`} />
          </section>

          <ViewSwitch viewKey={data.format} order={MODE_ORDER}><ViewSwitch viewKey={view} order={META_VIEWS}>
          {view === 'cards' && visibleItems.length > 0 ? (
            <section className="standard-meta__grid" aria-label={`Архетипы: ${data.formatLabel}, ${data.rankLabel}`}>
              {visibleItems.map((item, index) => (
                <article className="standard-meta-card" key={item.id}>
                  <div className="standard-meta-card__rank" aria-label={`Место ${rankById.get(item.id)}`}>{rankById.get(item.id)}</div>
                  <img className="standard-meta-card__class" src={classIcon(item.classKey)} alt="" width="56" height="56" loading="lazy" decoding="async" />
                  <div className="standard-meta-card__title">
                    <span>{item.translated ? item.archetype : 'ПЕРЕВОД ОЖИДАЕТСЯ'}</span>
                    <h2>{item.archetypeLabel}</h2>
                  </div>
                  <WinrateMedallion value={item.winrate} />
                  <dl className="standard-meta-card__metrics">
                    <div><dt>Популярность</dt><dd>{formatNumber(item.popularity, '%')}</dd></div>
                    <div><dt>Игры</dt><dd>{item.games?.toLocaleString('ru-RU') ?? '—'}</dd></div>
                    <div><dt>Ходы</dt><dd>{formatNumber(item.turns)}</dd></div>
                    <div><dt>Длительность</dt><dd>{formatNumber(item.durationMinutes, ' мин')}</dd></div>
                  </dl>
                  <div className={`standard-meta-card__climb ${item.climbingSpeed !== null && item.climbingSpeed < 0 ? 'standard-meta-card__climb--negative' : ''}`}>
                    <Swords size={17} />
                    <span>Скорость набора</span>
                    <strong>{formatNumber(item.climbingSpeed, ' ★/ч')}</strong>
                  </div>
                  <a
                    className="standard-meta__primary-button standard-meta__deck-action standard-meta-card__deck-button"
                    data-tour-id={index === 0 ? 'meta-deck-action' : undefined}
                    href={archetypeHref(item)}
                    aria-label={`Открыть страницу архетипа: ${item.archetypeLabel}`}
                  >
                    <span>Архетип</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </a>
                </article>
              ))}
            </section>
          ) : view !== 'cards' && visibleItems.length > 0 ? (
            <React.Suspense fallback={<AsyncSurfaceState variant="loading" title={view === 'tiers' ? 'Загружаем тиры' : 'Загружаем таблицу'} message="Готовим текущий срез." compact />}>
              {view === 'tiers' ? (
                <StandardMetaTierGroups items={visibleItems} format={format} formatLabel={data.formatLabel} rankLabel={data.rankLabel}
                  periodLabel={standardMetaPeriodLabel(selectedPeriod)} minGames={minGames} />
              ) : (
                <StandardMetaArchetypeTable items={visibleItems} rankById={rankById} format={format} rank={rank} period={selectedPeriod}
                  minGames={minGames} loadTrends={hasFullAccess} formatLabel={data.formatLabel} rankLabel={data.rankLabel}
                  periodLabel={standardMetaPeriodLabel(selectedPeriod)} tableRef={tableRef} />
              )}
            </React.Suspense>
          ) : (
            <AsyncSurfaceState
              variant="empty"
              title="Архетипы не найдены"
              message="Измените запрос или очистите строку поиска."
              compact
            />
          )}
          </ViewSwitch></ViewSwitch>

          {!hasFullAccess && !accessPending ? (
            <PaywallGate
              active
              presentation="inline"
              surface="meta"
              variant="standard"
              title="Вся мета — по рангам, периодам и форматам"
              {...paywall}
            />
          ) : null}
        </div>
      )}

    </>
  );
}

export default function StandardMetaPage({
  hasFullAccess = true,
  accessPending = false,
  teaserWaitsForAccess = false,
  paywall = DEFAULT_PAYWALL_ACCESS,
  embedded = false,
  initialTeaser = null,
}: StandardMetaPageProps) {
  const Root = embedded ? 'section' : 'main';
  return (
    <Root className="standard-meta" id={embedded ? undefined : 'main-content'}>
      <RecoverableSurfaceBoundary
        scope="standard-meta"
        title="Раздел меты временно недоступен"
        message="Навигация и остальные разделы сайта продолжают работать. Попробуйте открыть мету ещё раз."
      >
        <StandardMetaContent {...{ hasFullAccess, accessPending, teaserWaitsForAccess, paywall, initialTeaser }} />
      </RecoverableSurfaceBoundary>
    </Root>
  );
}
