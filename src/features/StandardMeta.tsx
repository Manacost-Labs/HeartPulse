import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Copy,
  LayoutGrid,
  Maximize2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  TableProperties,
  Trophy,
  X,
} from 'lucide-react';
import { usePageScrollLock } from '../hooks/usePageScrollLock';
import '../route-parchment.css';
import StandardMetaChart from './StandardMetaChart';
import './StandardMeta.css';

type MetaFormat = 'standard' | 'wild';
type MetaRank = 'legend' | 'diamond' | 'top_5k' | 'top_legend';
type MetaView = 'cards' | 'table';
type MetaSortKey = 'archetype' | 'winrate' | 'popularity' | 'games' | 'turns' | 'durationMinutes' | 'climbingSpeed';
type MetaSortDirection = 'asc' | 'desc';
type MetaClass = 'deathknight' | 'demonhunter' | 'druid' | 'hunter' | 'mage' | 'paladin' | 'priest' | 'rogue' | 'shaman' | 'warlock' | 'warrior';

type MetaItem = {
  id: string;
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

type DeckCacheEntry = {
  recommendation: Recommendation;
  preview: Preview | null;
  previewError: string;
};

const FORMATS: Array<{ id: MetaFormat; label: string; description: string }> = [
  { id: 'standard', label: 'Стандарт', description: 'Текущая ротация' },
  { id: 'wild', label: 'Вольный', description: 'Все дополнения' },
];

const RANKS: Array<{ id: MetaRank; label: string }> = [
  { id: 'legend', label: 'Легенда' },
  { id: 'diamond', label: 'Алмаз 4-1' },
  { id: 'top_5k', label: 'Топ-5000' },
  { id: 'top_legend', label: 'Высшая легенда' },
];

const EMPTY_DATA: MetaPayload = {
  format: 'standard',
  formatLabel: 'Стандарт',
  rank: 'legend',
  rankLabel: 'Легенда',
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
  if (!response.ok) throw new Error(payload.error || 'Сервер временно недоступен');
  return payload as T;
}

function formatNumber(value: number | null, suffix = ''): string {
  if (value === null) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}${suffix}`;
}

function winrateTone(value: number | null): 'neutral' | 'strong' | 'even' | 'weak' {
  return value === null ? 'neutral' : value >= 52 ? 'strong' : value >= 49 ? 'even' : 'weak';
}

function classIcon(classKey: MetaClass | null): string {
  return classKey ? `/class_icon/ui/${classKey}-64.webp` : '/class_icon/neutral.webp';
}

function WinrateMedallion({ value }: { value: number | null }) {
  const tone = winrateTone(value);
  return (
    <div className={`standard-meta__winrate standard-meta__winrate--${tone}`} aria-label={`Винрейт ${formatNumber(value, '%')}`}>
      <strong>{formatNumber(value, '%')}</strong>
      <span>винрейт</span>
    </div>
  );
}

function DeckModal({ state, onClose }: { state: DeckModalState; onClose: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [copied, setCopied] = useState(false);
  usePageScrollLock(true);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

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

  const modal = (
    <div className="standard-meta-modal" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={panelRef} className="standard-meta-modal__panel" role="dialog" aria-modal="true" aria-labelledby="standard-meta-deck-title">
        <button ref={closeRef} type="button" className="standard-meta-modal__close" onClick={onClose} aria-label="Закрыть окно">
          <X size={22} />
        </button>

        <header className="standard-meta-modal__header">
          <img src={classIcon(state.recommendation?.classKey ?? state.item.classKey)} alt="" width="64" height="64" />
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
            <div className="standard-meta-modal__image-stage">
              {state.preview?.ready && state.preview.imageUrl ? (
                <a href={state.preview.imageUrl} target="_blank" rel="noreferrer" className="standard-meta-modal__image-link" aria-label="Открыть изображение колоды в полном размере">
                  <img src={state.preview.imageUrl} alt={`Колода ${state.item.archetypeLabel}`} />
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
                </div>
              )}
            </div>

            <aside className="standard-meta-modal__details">
              <div className="standard-meta-modal__deck-meta">
                {state.recommendation.streamer && <span><Trophy size={15} /> {state.recommendation.streamer}</span>}
                {state.recommendation.sampleGames !== null && <span>{state.recommendation.sampleGames.toLocaleString('ru-RU')} игр</span>}
                {state.recommendation.winrate !== null && <span>{formatNumber(state.recommendation.winrate, '%')} WR</span>}
              </div>

              <div className="standard-meta-modal__code-block">
                <span>Код колоды</span>
                <code>{state.recommendation.deckCode}</code>
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
            </aside>
          </div>
        )}
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}

export default function StandardMetaPage() {
  const [format, setFormat] = useState<MetaFormat>('standard');
  const [rank, setRank] = useState<MetaRank>('legend');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<MetaView>('cards');
  const [sort, setSort] = useState<{ key: MetaSortKey | null; direction: MetaSortDirection }>({ key: null, direction: 'desc' });
  const [data, setData] = useState<MetaPayload>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<DeckModalState | null>(null);
  const requestId = useRef(0);
  const deckCache = useRef(new Map<string, DeckCacheEntry>());
  const closeModal = useCallback(() => setModal(null), []);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void apiJson<MetaPayload>(`/api/admin/standard-meta?format=${format}&rank=${rank}`, { signal: controller.signal })
      .then(payload => {
        if (currentRequest === requestId.current) setData(payload);
      })
      .catch(cause => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        if (currentRequest === requestId.current) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить мету');
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
    return () => controller.abort();
  }, [format, rank]);

  useEffect(() => {
    if (!modal?.preview?.hash || modal.preview.ready || modal.preview.state === 'error') return undefined;
    const timer = window.setTimeout(() => {
      void apiJson<{ preview: Preview }>(`/api/admin/standard-meta/preview/${encodeURIComponent(modal.preview!.hash)}`)
        .then(({ preview }) => setModal(current => {
          if (!current?.recommendation) return current;
          deckCache.current.set(`${current.recommendation.format}:${current.recommendation.rank}:${current.item.archetype.toLowerCase()}`, {
            recommendation: current.recommendation,
            preview,
            previewError: '',
          });
          return { ...current, preview, loadingPreview: false };
        }))
        .catch(cause => setModal(current => current ? {
          ...current,
          loadingPreview: false,
          previewError: cause instanceof Error ? cause.message : 'Не удалось обновить изображение',
        } : current));
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [modal?.preview]);

  const filteredItems = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return data.items;
    return data.items.filter(item => `${item.archetype} ${item.archetypeLabel}`.toLowerCase().includes(normalized));
  }, [data.items, query]);
  const rankById = useMemo(
    () => new Map(data.items.map((item, index) => [item.id, index + 1])),
    [data.items],
  );
  const tableItems = useMemo(() => {
    if (!sort.key) return filteredItems;
    const sortKey = sort.key;
    const multiplier = sort.direction === 'asc' ? 1 : -1;
    return [...filteredItems].sort((left, right) => {
      const leftValue = sortKey === 'archetype' ? left.archetypeLabel : left[sortKey];
      const rightValue = sortKey === 'archetype' ? right.archetypeLabel : right[sortKey];
      if (leftValue === null && rightValue === null) return (rankById.get(left.id) ?? 0) - (rankById.get(right.id) ?? 0);
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      const comparison = typeof leftValue === 'string'
        ? leftValue.localeCompare(String(rightValue), 'ru', { sensitivity: 'base' })
        : leftValue - Number(rightValue);
      return comparison === 0
        ? (rankById.get(left.id) ?? 0) - (rankById.get(right.id) ?? 0)
        : comparison * multiplier;
    });
  }, [filteredItems, rankById, sort]);

  const changeSort = (key: MetaSortKey) => {
    setSort(current => current.key === key
      ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
      : { key, direction: key === 'archetype' ? 'asc' : 'desc' });
  };

  const sortableHeading = (key: MetaSortKey, label: string) => {
    const active = sort.key === key;
    const directionLabel = active && sort.direction === 'asc' ? 'по возрастанию' : 'по убыванию';
    return (
      <th
        scope="col"
        className="standard-meta-table__sortable-heading"
        aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        <button
          type="button"
          className="standard-meta-table__sort-button"
          data-sort-key={key}
          data-active={active ? 'true' : 'false'}
          onClick={() => changeSort(key)}
          aria-label={`Сортировать по ${label.toLowerCase()}${active ? `, сейчас ${directionLabel}` : ''}`}
        >
          <span>{label}</span>
          {active
            ? (sort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)
            : <ChevronsUpDown size={14} />}
        </button>
      </th>
    );
  };

  const openDeck = async (item: MetaItem) => {
    const cacheKey = `${format}:${rank}:${item.archetype.toLowerCase()}`;
    const cached = deckCache.current.get(cacheKey);
    if (cached) {
      setModal({
        item,
        recommendation: cached.recommendation,
        preview: cached.preview,
        loadingRecommendation: false,
        loadingPreview: Boolean(cached.preview && !cached.preview.ready && cached.preview.state !== 'error'),
        error: '',
        previewError: cached.previewError,
      });
      return;
    }
    setModal({
      item,
      recommendation: null,
      preview: null,
      loadingRecommendation: true,
      loadingPreview: false,
      error: '',
      previewError: '',
    });
    try {
      const result = await apiJson<{ recommendation: Recommendation; preview: Preview }>('/api/admin/standard-meta/preview', {
        method: 'POST',
        body: JSON.stringify({ archetype: item.archetype, archetypeLabel: item.archetypeLabel, format, rank }),
      });
      setModal(current => current?.item.id === item.id ? {
        ...current,
        recommendation: result.recommendation,
        preview: result.preview,
        loadingRecommendation: false,
        loadingPreview: false,
      } : current);
      deckCache.current.set(cacheKey, { recommendation: result.recommendation, preview: result.preview, previewError: '' });
    } catch (cause) {
      setModal(current => current?.item.id === item.id ? {
        ...current,
        loadingRecommendation: false,
        error: cause instanceof Error ? cause.message : 'Сборка пока не найдена',
      } : current);
    }
  };

  return (
    <main className="standard-meta" id="main-content">
      <section className="standard-meta__masthead">
        <div className="standard-meta__masthead-copy">
          <span className="standard-meta__eyebrow"><ShieldCheck size={15} /> Только для администраторов</span>
          <h1>Мета Hearthstone</h1>
          <p>Срезы HSGuru, переводы Манакоста и одна проверенная сборка для каждого доступного архетипа.</p>
        </div>
        <div className="standard-meta__masthead-stats" aria-label="Сводка">
          <span><strong>{data.items.length}</strong> архетипов</span>
          <span><strong>{data.formatLabel}</strong> формат</span>
          <span><strong>{data.rankLabel}</strong> рейтинг</span>
        </div>
      </section>

      <section className="standard-meta__controls" aria-label="Фильтры меты">
        <div>
          <span className="standard-meta__control-label">Формат</span>
          <div className="standard-meta__segmented">
            {FORMATS.map(option => (
              <button key={option.id} type="button" aria-pressed={format === option.id} onClick={() => setFormat(option.id)}>
                <strong>{option.label}</strong><span>{option.description}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="standard-meta__control-label">Рейтинг</span>
          <div className="standard-meta__rank-tabs">
            {RANKS.map(option => (
              <button key={option.id} type="button" aria-pressed={rank === option.id} onClick={() => setRank(option.id)}>{option.label}</button>
            ))}
          </div>
        </div>
        <label className="standard-meta__search">
          <Search size={18} />
          <span className="sr-only">Поиск архетипа</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти архетип…" />
        </label>
      </section>

      {loading && (
        <div className="standard-meta__feedback" role="status"><RefreshCw className="standard-meta__spinner" /> Загружаем мету…</div>
      )}
      {!loading && error && (
        <div className="standard-meta__feedback standard-meta__feedback--error" role="alert"><AlertTriangle /> {error}</div>
      )}
      {!loading && !error && (
        <>
          <StandardMetaChart
            items={data.items}
            formatLabel={data.formatLabel}
            rankLabel={data.rankLabel}
            onOpenDeck={itemId => {
              const item = data.items.find(candidate => candidate.id === itemId);
              if (item) void openDeck(item);
            }}
          />

          <section className="standard-meta__results-toolbar" aria-label="Представление меты">
            <p><strong>{filteredItems.length}</strong> {filteredItems.length === 1 ? 'архетип' : 'архетипов'} в текущем срезе</p>
            <div className="standard-meta__view-switch" aria-label="Вид списка">
              <button type="button" data-meta-view="cards" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
                <LayoutGrid size={17} /> Карточки
              </button>
              <button type="button" data-meta-view="table" aria-pressed={view === 'table'} onClick={() => setView('table')}>
                <TableProperties size={17} /> Таблица
              </button>
            </div>
          </section>

          {view === 'cards' ? (
            <section className="standard-meta__grid" aria-label={`Архетипы: ${data.formatLabel}, ${data.rankLabel}`}>
              {filteredItems.map(item => (
                <article className="standard-meta-card" key={item.id}>
                  <div className="standard-meta-card__rank" aria-label={`Место ${rankById.get(item.id)}`}>{rankById.get(item.id)}</div>
                  <img className="standard-meta-card__class" src={classIcon(item.classKey)} alt="" width="56" height="56" />
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
                  <button type="button" className="standard-meta__primary-button standard-meta-card__deck-button" onClick={() => void openDeck(item)}>
                    <Sparkles size={18} /> Показать колоду
                  </button>
                </article>
              ))}
              {!filteredItems.length && <div className="standard-meta__feedback">По вашему запросу архетипы не найдены.</div>}
            </section>
          ) : (
            <section className="standard-meta-table-wrap" aria-label={`Таблица архетипов: ${data.formatLabel}, ${data.rankLabel}`} tabIndex={0}>
              <p className="standard-meta-table__mobile-hint">
                <ChevronsUpDown size={15} /> Нажимайте заголовки для сортировки и листайте таблицу вбок
              </p>
              <table className="standard-meta-table">
                <caption className="sr-only">Мета Hearthstone: {data.formatLabel}, {data.rankLabel}</caption>
                <thead>
                  <tr>
                    {sortableHeading('archetype', 'Архетип')}
                    {sortableHeading('winrate', 'Винрейт')}
                    {sortableHeading('popularity', 'Популярность')}
                    {sortableHeading('games', 'Игры')}
                    {sortableHeading('turns', 'Ходы')}
                    {sortableHeading('durationMinutes', 'Длительность')}
                    {sortableHeading('climbingSpeed', 'Набор')}
                    <th scope="col"><span className="sr-only">Действия</span></th>
                  </tr>
                </thead>
                <tbody>
                  {tableItems.map(item => (
                    <tr key={item.id} data-meta-archetype={item.id}>
                      <th scope="row" className="standard-meta-table__archetype">
                        <span className="standard-meta-table__rank">{rankById.get(item.id)}</span>
                        <img src={classIcon(item.classKey)} alt="" width="38" height="38" />
                        <span className="standard-meta-table__name">
                          <strong>{item.archetypeLabel}</strong>
                          <small>{item.translated ? item.archetype : 'Перевод ожидается'}</small>
                        </span>
                      </th>
                      <td><strong className={`standard-meta-table__winrate standard-meta-table__winrate--${winrateTone(item.winrate)}`}>{formatNumber(item.winrate, '%')}</strong></td>
                      <td>{formatNumber(item.popularity, '%')}</td>
                      <td>{item.games?.toLocaleString('ru-RU') ?? '—'}</td>
                      <td>{formatNumber(item.turns)}</td>
                      <td>{formatNumber(item.durationMinutes, ' мин')}</td>
                      <td className={item.climbingSpeed !== null && item.climbingSpeed < 0 ? 'standard-meta-table__climb--negative' : 'standard-meta-table__climb'}>{formatNumber(item.climbingSpeed, ' ★/ч')}</td>
                      <td>
                        <button type="button" className="standard-meta__primary-button standard-meta-table__deck-button" onClick={() => void openDeck(item)} aria-label={`Показать колоду: ${item.archetypeLabel}`}>
                          <Sparkles size={16} /> Колода
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredItems.length && <div className="standard-meta__feedback">По вашему запросу архетипы не найдены.</div>}
            </section>
          )}
        </>
      )}

      {modal && <DeckModal state={modal} onClose={closeModal} />}
    </main>
  );
}
