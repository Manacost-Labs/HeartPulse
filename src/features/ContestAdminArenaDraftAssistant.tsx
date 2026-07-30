import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import type {
  ArenaClassId,
  ArenaDraftAdviceRequest,
  ArenaDraftAdviceResponse,
  ArenaDraftChoice,
  ArenaSynergyCard,
  ArenaSynergyPayload,
} from '../../shared/arenaSynergyContract';
import {
  addDraftCard,
  ARENA_DRAFT_ASSISTANT_STORAGE_KEY,
  buildCurveSnapshot,
  classIconUrl,
  createEmptyDraftState,
  fullCardImageUrl,
  groupDraftDeck,
  hydrateDraftState,
  removeDraftCardCopy,
  suggestArenaDraftCandidates,
  type ArenaDraftAssistantState,
} from './arenaDraftAssistantModel';
import './ContestAdminArenaDraftAssistant.css';

type ConcreteArenaClass = Exclude<ArenaClassId, 'ALL'>;
type CandidateIds = [string, string, string];
type AdviceRequester = (
  request: ArenaDraftAdviceRequest,
  signal?: AbortSignal,
) => Promise<ArenaDraftAdviceResponse>;
type AdviceLoadState = {
  requestKey: string | null;
  response: ArenaDraftAdviceResponse | null;
  error: string | null;
  loading: boolean;
};
type AdviceLoadAction =
  | { type: 'loading'; requestKey: string }
  | { type: 'resolved'; requestKey: string; response: ArenaDraftAdviceResponse }
  | { type: 'rejected'; requestKey: string; error: string };

const CANDIDATE_LABELS = ['Левая карта', 'Центральная карта', 'Правая карта'] as const;
const INITIAL_ADVICE_STATE: AdviceLoadState = {
  requestKey: null,
  response: null,
  error: null,
  loading: false,
};

function adviceLoadReducer(
  state: AdviceLoadState,
  action: AdviceLoadAction,
): AdviceLoadState {
  if (action.type === 'loading') {
    return { requestKey: action.requestKey, response: null, error: null, loading: true };
  }
  if (action.type === 'resolved') {
    return {
      requestKey: action.requestKey,
      response: action.response,
      error: null,
      loading: false,
    };
  }
  return {
    requestKey: action.requestKey,
    response: null,
    error: action.error,
    loading: false,
  };
}

function formatDate(value: string | null): string {
  if (!value) return 'время не указано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'время не указано';
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function sampleModeLabel(payload: ArenaSynergyPayload): string {
  if (payload.reliability.sampleMode === 'stable') return 'выборка стабильна';
  if (payload.reliability.sampleMode === 'warming') return 'выборка набирается';
  if (payload.reliability.sampleMode === 'last-known-good') return 'последний надёжный расчёт';
  return 'мало данных';
}

function unavailableReason(payload: ArenaSynergyPayload): string | null {
  if (!payload.draftAdvisor) {
    return 'Для выбранного класса пока нет модели помощника драфта.';
  }
  if (payload.reliability.sampleMode === 'insufficient') {
    return 'Для выбранного класса пока мало успешных забегов. Советы временно отключены.';
  }
  if (payload.dataQuality.status === 'blocked') {
    return 'Свежая выборка не прошла проверки качества. Советы временно отключены.';
  }
  return null;
}

function strengthLabel(choice: ArenaDraftChoice): string {
  if (choice.score >= 75) return 'Сильный выбор';
  if (choice.score >= 60) return 'Хороший выбор';
  if (choice.score >= 45) return 'Ситуативно';
  return 'Слабый сигнал';
}

function recommendationText(choice: ArenaDraftChoice): string {
  const usefulReasons = choice.reasons.filter(reason => !reason.startsWith('Базовая сила:'));
  const reasons = usefulReasons.slice(0, 2).map(reason => (
    reason.charAt(0).toLocaleLowerCase('ru-RU') + reason.slice(1).replace(/\.$/, '')
  ));
  return `Лучший выбор: ${choice.card.name} — ${reasons.join('; ') || 'лучший общий результат модели'}.`;
}

function ArenaDraftCardPicker({
  id,
  label,
  cards,
  value,
  disabledCardIds = [],
  onChange,
}: {
  id: string;
  label: string;
  cards: ArenaSynergyCard[];
  value: string;
  disabledCardIds?: string[];
  onChange: (cardId: string) => void;
}) {
  const selectedCard = cards.find(card => card.id === value) ?? null;
  const [query, setQuery] = useState(selectedCard?.name ?? '');
  const disabledIds = useMemo(() => new Set(disabledCardIds), [disabledCardIds]);
  const availableCards = useMemo(
    () => cards.filter(card => !disabledIds.has(card.id) || card.id === value),
    [cards, disabledIds, value],
  );

  useEffect(() => {
    setQuery(selectedCard?.name ?? '');
  }, [selectedCard?.id, selectedCard?.name]);

  const commit = (nextQuery: string) => {
    const normalized = nextQuery.trim().toLocaleLowerCase('ru-RU');
    const match = availableCards.find(card => (
      card.name.toLocaleLowerCase('ru-RU') === normalized
      || card.id.toLocaleLowerCase('en-US') === normalized
    ));
    onChange(match?.id ?? '');
  };

  return (
    <label className="draft-card-picker" htmlFor={id}>
      <span>{label}</span>
      <span className="draft-card-picker-control">
        <Search size={16} aria-hidden="true" />
        <input
          id={id}
          type="search"
          list={`${id}-options`}
          value={query}
          placeholder="Найдите карту"
          autoComplete="off"
          onChange={event => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            commit(nextQuery);
          }}
          onBlur={() => {
            if (!selectedCard) setQuery('');
          }}
        />
        <ChevronDown size={15} aria-hidden="true" />
      </span>
      <datalist id={`${id}-options`}>
        {availableCards.map(card => (
          <option key={card.id} value={card.name}>
            {card.cost ?? '—'} маны · {card.id}
          </option>
        ))}
      </datalist>
    </label>
  );
}

function DraftMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'gold';
}) {
  return (
    <div className={`draft-choice-metric is-${tone}`}>
      <span>{label}</span>
      <i aria-hidden="true"><b style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i>
      <strong>{value.toFixed(0)}</strong>
    </div>
  );
}

function CandidateCard({
  card,
  choice,
  selected,
  imageUrl,
  onSelect,
}: {
  card: ArenaSynergyCard | null;
  choice: ArenaDraftChoice | null;
  selected: boolean;
  imageUrl: (cardId: string) => string;
  onSelect: () => void;
}) {
  const winner = choice?.rank === 1;
  if (!card) {
    return (
      <div className="draft-choice-card is-empty" aria-hidden="true">
        <img src="/assets/arena_icon.webp" alt="" />
        <span>Карта появится после выбора</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`draft-choice-card${winner ? ' is-winner' : ''}${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {winner && <span className="draft-choice-seal">Брать</span>}
      <span className="draft-choice-art">
        <img
          src={imageUrl(card.id)}
          alt={`Карта «${card.name}»`}
          loading="eager"
          onError={event => { event.currentTarget.hidden = true; }}
        />
      </span>
      <span className="draft-choice-name">
        <strong>{card.name}</strong>
        <small>{card.cost ?? '—'} маны · {choice ? strengthLabel(choice) : 'ожидаем расчёт'}</small>
      </span>
      {choice ? (
        <span className="draft-choice-score">
          <span>
            <strong>{choice.score.toFixed(1)}</strong>
            <small>общая оценка</small>
          </span>
          <span className="draft-choice-metrics">
            <DraftMetric label="Сила карты" value={choice.components.base} />
            <DraftMetric label="Связки" value={choice.components.synergy} />
            <DraftMetric label="Манакривая" value={choice.components.curve} tone="gold" />
          </span>
        </span>
      ) : (
        <span className="draft-choice-waiting">Выберите все три карты</span>
      )}
      {selected && (
        <span className="draft-choice-selected">
          <Check size={14} aria-hidden="true" /> Выбрана для добавления
        </span>
      )}
    </button>
  );
}

export function ArenaDraftAssistantWorkbench({
  payload,
  requestAdvice,
  reloading = false,
  initialDraft,
  resolveCardImage = fullCardImageUrl,
  resolveCardThumb = cardId => `/api/card-image/${encodeURIComponent(cardId)}/thumb.webp`,
  onClassChange,
  onRefresh,
}: {
  payload: ArenaSynergyPayload;
  requestAdvice: AdviceRequester;
  reloading?: boolean;
  initialDraft?: ArenaDraftAssistantState;
  resolveCardImage?: (cardId: string) => string;
  resolveCardThumb?: (cardId: string) => string;
  onClassChange: (classId: ConcreteArenaClass) => void;
  onRefresh: () => void;
}) {
  const context = payload.draftAdvisor;
  const cards = useMemo(() => context?.cards ?? [], [context]);
  const cardsById = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]);
  const selectedClass = payload.selectedClass as ConcreteArenaClass;
  const [draft, setDraft] = useState<ArenaDraftAssistantState>(() => {
    if (initialDraft) return hydrateDraftState(initialDraft, selectedClass, cards);
    try {
      const persisted = JSON.parse(localStorage.getItem(ARENA_DRAFT_ASSISTANT_STORAGE_KEY) || 'null');
      return hydrateDraftState(persisted, selectedClass, cards);
    } catch {
      return createEmptyDraftState(selectedClass);
    }
  });
  const [cardToAdd, setCardToAdd] = useState('');
  const [adviceState, dispatchAdvice] = useReducer(adviceLoadReducer, INITIAL_ADVICE_STATE);
  const reason = unavailableReason(payload);
  const suggestedCandidates = useMemo(
    () => context
      ? suggestArenaDraftCandidates({
        deckCardIds: draft.deckCardIds,
        context,
        combinations: payload.combinations,
      })
      : null,
    [context, draft.deckCardIds, payload.combinations],
  );
  const effectiveCandidateCardIds = useMemo<CandidateIds>(
    () => draft.candidateCardIds.some(Boolean)
      ? draft.candidateCardIds
      : suggestedCandidates ?? ['', '', ''],
    [draft.candidateCardIds, suggestedCandidates],
  );

  useEffect(() => {
    try {
      localStorage.setItem(ARENA_DRAFT_ASSISTANT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Draft persistence is a convenience. The tool remains usable when storage is unavailable.
    }
  }, [draft]);

  const candidatesReady = effectiveCandidateCardIds.every(Boolean)
    && new Set(effectiveCandidateCardIds).size === 3;
  const adviceRequestKey = candidatesReady && !reason
    ? `${selectedClass}:${draft.deckCardIds.join(',')}:${effectiveCandidateCardIds.join(',')}`
    : null;
  const advice = adviceState.requestKey === adviceRequestKey ? adviceState.response : null;
  const adviceLoading = Boolean(adviceRequestKey)
    && (adviceState.requestKey !== adviceRequestKey || adviceState.loading);
  const adviceError = adviceState.requestKey === adviceRequestKey ? adviceState.error : null;

  useEffect(() => {
    if (!context || !adviceRequestKey) return undefined;
    const controller = new AbortController();
    dispatchAdvice({ type: 'loading', requestKey: adviceRequestKey });
    void requestAdvice({
      class: selectedClass,
      deckCardIds: draft.deckCardIds,
      candidateCardIds: effectiveCandidateCardIds,
    }, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        dispatchAdvice({ type: 'resolved', requestKey: adviceRequestKey, response: result });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        dispatchAdvice({
          type: 'rejected',
          requestKey: adviceRequestKey,
          error: error instanceof Error ? error.message : 'Не удалось сравнить карты.',
        });
      });
    return () => controller.abort();
  }, [
    adviceRequestKey,
    context,
    draft.deckCardIds,
    effectiveCandidateCardIds,
    requestAdvice,
    selectedClass,
  ]);

  const deckRows = useMemo(
    () => groupDraftDeck(draft.deckCardIds, cards),
    [cards, draft.deckCardIds],
  );
  const curve = useMemo(
    () => context ? buildCurveSnapshot(draft.deckCardIds, context) : [],
    [context, draft.deckCardIds],
  );
  const choicesById = useMemo(
    () => new Map((advice?.advice.choices ?? []).map(choice => [choice.card.id, choice])),
    [advice],
  );
  const winner = advice?.advice.choices[0] ?? null;
  const effectiveSelectedCardId = draft.selectedCardId ?? winner?.card.id ?? null;
  const selectedChoice = effectiveSelectedCardId
    ? choicesById.get(effectiveSelectedCardId) ?? null
    : null;

  const setCandidate = (index: number, cardId: string) => {
    setDraft(current => ({
      ...current,
      candidateCardIds: (
        current.candidateCardIds.some(Boolean)
          ? current.candidateCardIds
          : suggestedCandidates ?? ['', '', '']
      ).map((id, candidateIndex) => (
        candidateIndex === index ? cardId : id
      )) as CandidateIds,
      selectedCardId: null,
    }));
  };

  const addSelectedChoice = () => {
    const cardId = selectedChoice?.card.id ?? winner?.card.id;
    if (!cardId || !context) return;
    setDraft(current => ({
      ...current,
      deckCardIds: addDraftCard(current.deckCardIds, cardId, context.deckSize),
      candidateCardIds: ['', '', ''],
      selectedCardId: null,
    }));
  };

  const resetDraft = () => {
    setDraft(createEmptyDraftState(selectedClass));
    setCardToAdd('');
  };

  return (
    <section className="arena-draft-assistant-page" aria-labelledby="arena-draft-assistant-title">
      <header className="draft-assistant-toolbar">
        <label className="draft-class-select" htmlFor="draft-assistant-class">
          <img src={classIconUrl(selectedClass)} alt="" aria-hidden="true" />
          <span>
            <small>Класс</small>
            <select
              id="draft-assistant-class"
              value={selectedClass}
              onChange={event => onClassChange(event.target.value as ConcreteArenaClass)}
            >
              {payload.availableClasses
                .filter(option => option.id !== 'ALL')
                .map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label} · {option.runs} забегов
                  </option>
                ))}
            </select>
          </span>
        </label>
        <div className="draft-data-freshness">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            Патч {payload.cohort.patchVersion ?? 'не определён'}
            {' · '}{payload.summary.runsAnalyzed} забегов
            {' · '}{sampleModeLabel(payload)}
          </span>
          <small>Обновлено {formatDate(payload.generatedAt)}</small>
        </div>
        <button
          type="button"
          className="draft-refresh-button"
          onClick={onRefresh}
          disabled={reloading}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {reloading ? 'Обновляем…' : 'Обновить'}
        </button>
      </header>

      {reason ? (
        <div className="draft-assistant-alert" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <strong>Совет пока недоступен</strong>
            <span>{reason}</span>
          </div>
        </div>
      ) : context ? (
        <div className="draft-workbench">
          <aside className="draft-deck-panel" aria-labelledby="draft-current-deck-title">
            <div className="draft-deck-heading">
              <div>
                <h2 id="draft-current-deck-title">Текущая колода</h2>
                <span>Учитывается при каждом совете</span>
              </div>
              <strong>{draft.deckCardIds.length}/{context.deckSize}</strong>
            </div>

            <ul className="draft-rules-strip" aria-label="Правила текущего драфта">
              <li><strong>{context.deckSize}</strong> карт в колоде</li>
              <li><strong>1-й</strong> выбор — легендарная группа</li>
              <li><strong>↻</strong> повторы разрешены*</li>
              <li><strong>{cards.length}</strong> карт в текущей выборке</li>
            </ul>

            <div className="draft-deck-add">
              <ArenaDraftCardPicker
                id="draft-deck-card-picker"
                label="Добавить карту вручную"
                cards={cards}
                value={cardToAdd}
                onChange={setCardToAdd}
              />
              <button
                type="button"
                aria-label="Добавить выбранную карту в колоду"
                disabled={!cardToAdd || draft.deckCardIds.length >= context.deckSize}
                onClick={() => {
                  setDraft(current => ({
                    ...current,
                    deckCardIds: addDraftCard(current.deckCardIds, cardToAdd, context.deckSize),
                  }));
                  setCardToAdd('');
                }}
              >
                <Plus size={19} aria-hidden="true" />
              </button>
            </div>

            <div className="draft-mana-curve" aria-label="Текущая манакривая">
              <div>
                <BarChart3 size={17} aria-hidden="true" />
                <strong>Манакривая</strong>
              </div>
              <ol>
                {curve.map(bucket => (
                  <li key={bucket.id}>
                    <span>{bucket.label}</span>
                    <i aria-hidden="true"><b style={{ height: `${Math.max(8, bucket.fillPercent)}%` }} /></i>
                    <strong>{bucket.count}<small>/{bucket.targetCount}</small></strong>
                  </li>
                ))}
              </ol>
            </div>

            {deckRows.length ? (
              <ol className="draft-deck-list" aria-label="Состав текущей колоды">
                {deckRows.map(row => (
                  <li key={row.card.id}>
                    <span className="draft-deck-card-art">
                      <img
                        src={resolveCardThumb(row.card.id)}
                        alt=""
                        loading="lazy"
                        onError={event => { event.currentTarget.hidden = true; }}
                      />
                      <b>{row.card.cost ?? '—'}</b>
                    </span>
                    <span>
                      <strong>{row.card.name}</strong>
                      <small>{row.card.cost ?? '—'} маны</small>
                    </span>
                    <b>×{row.count}</b>
                    <button
                      type="button"
                      aria-label={`Убрать одну копию «${row.card.name}»`}
                      onClick={() => setDraft(current => ({
                        ...current,
                        deckCardIds: removeDraftCardCopy(current.deckCardIds, row.card.id),
                      }))}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="draft-empty-deck">
                <img src="/assets/arena_icon.webp" alt="" />
                <strong>Колода пока пуста</strong>
                <span>Выберите три карты справа — помощник уже может сравнить их базовую силу.</span>
              </div>
            )}
          </aside>

          <main className="draft-choice-stage">
            <div className="draft-choice-heading">
              <Sparkles size={20} aria-hidden="true" />
              <div>
                <h2 id="arena-draft-assistant-title">Выберите лучшую карту</h2>
                <p>
                  Помощник сам предлагает сильную тройку из карт текущей когорты.
                  Реальное предложение из игры можно ввести вручную ниже.
                </p>
              </div>
              <button
                type="button"
                className="draft-auto-offer"
                disabled={!suggestedCandidates}
                onClick={() => {
                  if (!suggestedCandidates) return;
                  setDraft(current => ({
                    ...current,
                    candidateCardIds: suggestedCandidates,
                    selectedCardId: null,
                  }));
                }}
              >
                <Sparkles size={16} aria-hidden="true" />
                {draft.deckCardIds.length === 0
                  ? 'Сравнить легендарные группы'
                  : 'Предложить три карты'}
              </button>
            </div>

            <p className="draft-auto-offer-note">
              Рекомендационная тройка не предсказывает случайное предложение клиента:
              если в игре показаны другие карты или у легендарки есть пакет поддержки,
              добавьте пакет в колоду и замените три поля ниже. Сезонные ограничения
              отдельных карт применяет сам игровой клиент.
            </p>

            <div className="draft-candidate-pickers">
              {CANDIDATE_LABELS.map((label, index) => (
                <ArenaDraftCardPicker
                  key={label}
                  id={`draft-candidate-${index}`}
                  label={label}
                  cards={cards}
                  value={effectiveCandidateCardIds[index]}
                  disabledCardIds={effectiveCandidateCardIds.filter((_id, itemIndex) => itemIndex !== index)}
                  onChange={cardId => setCandidate(index, cardId)}
                />
              ))}
            </div>

            <div className="draft-choice-grid" aria-busy={adviceLoading}>
              {effectiveCandidateCardIds.map((cardId, index) => (
                <CandidateCard
                  key={`${index}:${cardId || 'empty'}`}
                  card={cardsById.get(cardId) ?? null}
                  choice={choicesById.get(cardId) ?? null}
                  selected={Boolean(cardId && effectiveSelectedCardId === cardId)}
                  imageUrl={resolveCardImage}
                  onSelect={() => {
                    if (cardId) setDraft(current => ({ ...current, selectedCardId: cardId }));
                  }}
                />
              ))}
              {adviceLoading && (
                <div className="draft-choice-loading" role="status">
                  <RefreshCw size={20} aria-hidden="true" />
                  Сравниваем карты…
                </div>
              )}
            </div>

            {adviceError && (
              <div className="draft-inline-error" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                {adviceError}
              </div>
            )}

            {winner ? (
              <output className="draft-recommendation" aria-live="polite">
                <Sparkles size={20} aria-hidden="true" />
                <strong>{recommendationText(winner)}</strong>
              </output>
            ) : (
              <div className="draft-recommendation is-placeholder">
                <Sparkles size={20} aria-hidden="true" />
                <span>Совет появится, когда выбраны три разные карты.</span>
              </div>
            )}

            <div className="draft-choice-actions">
              <button
                type="button"
                className="is-primary"
                onClick={addSelectedChoice}
                disabled={!winner || draft.deckCardIds.length >= context.deckSize}
              >
                <Plus size={17} aria-hidden="true" />
                Добавить выбранную в колоду
              </button>
              <button
                type="button"
                onClick={() => setDraft(current => ({
                  ...current,
                  deckCardIds: current.deckCardIds.slice(0, -1),
                }))}
                disabled={!draft.deckCardIds.length}
              >
                <Undo2 size={17} aria-hidden="true" />
                Отменить последний выбор
              </button>
              <button type="button" onClick={resetDraft}>
                <RotateCcw size={17} aria-hidden="true" />
                Новый драфт
              </button>
            </div>

            {winner && (
              <section className="draft-choice-reasons" aria-labelledby="draft-choice-reasons-title">
                <div>
                  <h3 id="draft-choice-reasons-title">Почему такой выбор</h3>
                  <span>
                    Уверенность: {winner.confidence === 'high'
                      ? 'высокая'
                      : winner.confidence === 'medium' ? 'средняя' : 'низкая'}
                  </span>
                </div>
                <ul>
                  {winner.reasons.map(item => (
                    <li key={item}><Check size={16} aria-hidden="true" />{item}</li>
                  ))}
                </ul>
                {winner.warnings.length > 0 && (
                  <div className="draft-choice-warning">
                    <AlertTriangle size={17} aria-hidden="true" />
                    <span>{winner.warnings.join(' ')}</span>
                  </div>
                )}
              </section>
            )}

            <details className="draft-method-details">
              <summary>Как работает оценка и где её пределы</summary>
              <ul>
                {context.limitations.map(item => <li key={item}>{item}</li>)}
              </ul>
            </details>
          </main>
        </div>
      ) : null}
    </section>
  );
}

async function loadArenaSynergyPayload(
  classId: ArenaClassId,
  signal?: AbortSignal,
  forceRefresh = false,
): Promise<ArenaSynergyPayload> {
  const params = new URLSearchParams({ class: classId });
  if (forceRefresh) params.set('refresh', '1');
  const response = await fetch(`/api/admin/arena-synergies?${params}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await response.json().catch(() => ({})) as ArenaSynergyPayload & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить данные помощника.');
  return data;
}

export async function requestArenaDraftAdvice(
  request: ArenaDraftAdviceRequest,
  signal?: AbortSignal,
): Promise<ArenaDraftAdviceResponse> {
  const response = await fetch('/api/admin/arena-draft-advice', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Request': '1',
    },
    body: JSON.stringify(request),
    signal,
  });
  const data = await response.json().catch(() => ({})) as ArenaDraftAdviceResponse & {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || 'Не удалось получить совет по драфту.');
  return data;
}

function preferredClass(payload: ArenaSynergyPayload): ConcreteArenaClass | null {
  return payload.availableClasses
    .filter((option): option is typeof option & { id: ConcreteArenaClass } => option.id !== 'ALL')
    .sort((left, right) => right.runs - left.runs)[0]?.id ?? null;
}

function ArenaDraftAssistantData() {
  const [payload, setPayload] = useState<ArenaSynergyPayload | null>(null);
  const [selectedClass, setSelectedClass] = useState<ConcreteArenaClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (
    classId: ArenaClassId,
    options: { signal?: AbortSignal; forceRefresh?: boolean } = {},
  ) => {
    let continuingWithConcreteClass = false;
    setLoading(true);
    setError(null);
    try {
      const next = await loadArenaSynergyPayload(
        classId,
        options.signal,
        options.forceRefresh,
      );
      options.signal?.throwIfAborted();
      if (classId === 'ALL') {
        const nextClass = preferredClass(next);
        if (!nextClass) throw new Error('В свежей выборке нет классов с данными.');
        continuingWithConcreteClass = true;
        setSelectedClass(nextClass);
        return;
      }
      setSelectedClass(classId as ConcreteArenaClass);
      setPayload(next);
    } catch (caught) {
      if (!options.signal?.aborted) {
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить помощника драфта.');
      }
    } finally {
      if (!options.signal?.aborted && !continuingWithConcreteClass) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (selectedClass) void load(selectedClass, { signal: controller.signal });
    else void load('ALL', { signal: controller.signal });
    return () => controller.abort();
  }, [load, selectedClass]);

  if (!payload && loading) {
    return (
      <div className="draft-assistant-state" role="status">
        <RefreshCw size={24} aria-hidden="true" />
        <strong>Готовим стол драфта…</strong>
        <span>Загружаем актуальный пул карт и модель класса.</span>
      </div>
    );
  }

  if (!payload || error) {
    return (
      <div className="draft-assistant-state is-error" role="alert">
        <AlertTriangle size={24} aria-hidden="true" />
        <strong>Помощник не загрузился</strong>
        <span>{error || 'Не удалось получить данные.'}</span>
        <button type="button" onClick={() => void load(selectedClass ?? 'ALL')}>
          Попробовать ещё раз
        </button>
      </div>
    );
  }

  return (
    <ArenaDraftAssistantWorkbench
      key={`${payload.cohort.id}:${payload.selectedClass}`}
      payload={payload}
      requestAdvice={requestArenaDraftAdvice}
      reloading={loading}
      onClassChange={classId => {
        setLoading(true);
        setPayload(null);
        setSelectedClass(classId);
      }}
      onRefresh={() => void load(payload.selectedClass, { forceRefresh: true })}
    />
  );
}

export default function ArenaDraftAssistantPage({
  isAdmin,
  authChecking = false,
}: {
  isAdmin: boolean;
  authChecking?: boolean;
}) {
  if (authChecking) {
    return (
      <section className="arena-draft-assistant-page draft-assistant-route-state">
        <output className="draft-assistant-state">
          <RefreshCw size={24} aria-hidden="true" />
          <strong>Проверяем доступ…</strong>
          <span>Помощник драфта пока доступен только администратору.</span>
        </output>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="arena-draft-assistant-page draft-assistant-route-state">
        <div className="draft-assistant-state is-error" role="alert">
          <ShieldCheck size={28} aria-hidden="true" />
          <strong>Раздел пока закрыт</strong>
          <span>Помощник драфта проходит внутреннюю проверку и доступен только администратору.</span>
        </div>
      </section>
    );
  }

  return <ArenaDraftAssistantData />;
}
