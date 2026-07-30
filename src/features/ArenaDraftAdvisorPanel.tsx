import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Gauge,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ArenaDraftAdvisorInputError,
  rankArenaDraftChoices,
} from '../../shared/arenaDraftAdvisor';
import type {
  ArenaDraftAdvice,
  ArenaDraftChoice,
  ArenaDraftModel,
  ArenaSynergyPayload,
} from '../../shared/arenaSynergyContract';
import { ArenaSynergyCardIdentity } from './ArenaSynergyCardIdentity';
import './ArenaDraftAdvisorPanel.css';

type CandidateIds = [string, string, string];

const CANDIDATE_SLOTS = [
  { id: 'first', label: 1 },
  { id: 'second', label: 2 },
  { id: 'third', label: 3 },
] as const;

function confidenceLabel(value: ArenaDraftChoice['confidence']): string {
  if (value === 'high') return 'Высокая уверенность';
  if (value === 'medium') return 'Средняя уверенность';
  return 'Низкая уверенность';
}

function scoreLabel(score: number): string {
  if (score >= 75) return 'Сильный выбор';
  if (score >= 60) return 'Хороший выбор';
  if (score >= 45) return 'Ситуативный выбор';
  return 'Слабый сигнал';
}

function DecisionMeter({
  label,
  value,
  weight,
}: {
  label: string;
  value: number;
  weight: string;
}) {
  return (
    <div className="arena-draft-meter">
      <div>
        <span>{label}</span>
        <small>вес {weight}</small>
        <strong>{value.toFixed(1)}</strong>
      </div>
      <meter
        className="arena-draft-meter-track"
        aria-label={`${label}: ${value.toFixed(1)} из 100`}
        min={0}
        max={100}
        value={value}
      />
    </div>
  );
}

function AdviceCard({
  choice,
  isWinner,
  model,
}: {
  choice: ArenaDraftChoice;
  isWinner: boolean;
  model: ArenaDraftModel;
}) {
  return (
    <article className={`arena-draft-choice${isWinner ? ' is-winner' : ''}`}>
      <header>
        <span className="arena-draft-rank" aria-label={`Место ${choice.rank}`}>
          {choice.rank}
        </span>
        <ArenaSynergyCardIdentity card={choice.card} />
        <div className="arena-draft-total">
          <strong>{choice.score.toFixed(1)}</strong>
          <small>{scoreLabel(choice.score)}</small>
        </div>
      </header>

      <div className="arena-draft-decision-scale" aria-label="Состав оценки">
        <DecisionMeter
          label="Сила карты"
          value={choice.components.base}
          weight={`${Math.round(model.weights.base * 100)}%`}
        />
        <DecisionMeter
          label="Связки"
          value={choice.components.synergy}
          weight={`${Math.round(model.weights.synergy * 100)}%`}
        />
        <DecisionMeter
          label="Манакривая"
          value={choice.components.curve}
          weight={`${Math.round(model.weights.curve * 100)}%`}
        />
      </div>

      <span className={`arena-draft-confidence is-${choice.confidence}`}>
        {choice.confidence === 'high'
          ? <ShieldCheck size={15} aria-hidden="true" />
          : <Gauge size={15} aria-hidden="true" />}
        {confidenceLabel(choice.confidence)}
      </span>

      <ul className="arena-draft-reasons">
        {choice.reasons.map(reason => <li key={reason}>{reason}</li>)}
      </ul>
      {choice.warnings.length > 0 && (
        <ul className="arena-draft-warnings">
          {choice.warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </article>
  );
}

function unavailableReason(payload: ArenaSynergyPayload): string | null {
  if (payload.selectedClass === 'ALL') {
    return 'Выберите конкретный класс: советы нельзя смешивать между разными классами.';
  }
  if (!payload.draftAdvisor) {
    return 'Для этой когорты пока недостаточно данных или открыт старый сохранённый расчёт.';
  }
  if (payload.reliability.sampleMode === 'insufficient') {
    return 'В классе меньше 20 успешных забегов. Совет появится после накопления выборки.';
  }
  if (payload.dataQuality.status === 'blocked') {
    return 'Новая выборка заблокирована проверками качества данных.';
  }
  return null;
}

export function ArenaDraftAdvisorPanel({ payload }: { payload: ArenaSynergyPayload }) {
  const [deckCardIds, setDeckCardIds] = useState<string[]>([]);
  const [cardToAdd, setCardToAdd] = useState('');
  const [candidateIds, setCandidateIds] = useState<CandidateIds>(['', '', '']);

  const context = payload.draftAdvisor;
  const cards = useMemo(() => context?.cards ?? [], [context]);
  const cardsById = useMemo(
    () => new Map(cards.map(card => [card.id, card])),
    [cards],
  );
  const reason = unavailableReason(payload);
  const adviceState = useMemo<{
    advice: ArenaDraftAdvice | null;
    error: string | null;
  }>(() => {
    if (
      reason
      || !context
      || candidateIds.some(id => !id)
      || new Set(candidateIds).size !== candidateIds.length
    ) {
      return { advice: null, error: null };
    }
    try {
      return {
        advice: rankArenaDraftChoices({
          context,
          combinations: payload.combinations,
          deckCardIds,
          candidateCardIds: candidateIds,
        }),
        error: null,
      };
    } catch (error) {
      return {
        advice: null,
        error: error instanceof ArenaDraftAdvisorInputError
          ? error.message
          : 'Не удалось сравнить предложенные карты.',
      };
    }
  }, [candidateIds, context, deckCardIds, payload.combinations, reason]);

  const addDeckCard = () => {
    if (!cardToAdd || !context || deckCardIds.length >= context.deckSize) return;
    setDeckCardIds(current => [...current, cardToAdd]);
    setCardToAdd('');
  };
  const setCandidate = (index: number, value: string) => {
    setCandidateIds(current => current.map((id, candidateIndex) => (
      candidateIndex === index ? value : id
    )) as CandidateIds);
  };
  const reset = () => {
    setDeckCardIds([]);
    setCardToAdd('');
    setCandidateIds(['', '', '']);
  };

  return (
    <div role="tabpanel" className="arena-synergy-section arena-draft-advisor">
      <div className="arena-synergy-section-heading">
        <div>
          <h3><Sparkles size={19} aria-hidden="true" /> Помощник драфта</h3>
          <p>
            Сравнение трёх карт по силе, доказанным связкам и манакривой.
            Это рейтинг выбора, а не прогноз побед.
          </p>
        </div>
        <span>Черновик v2</span>
      </div>

      {reason ? (
        <output className="arena-synergy-message is-warning">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{reason}</span>
        </output>
      ) : context ? (
        <>
          <section className="arena-draft-context" aria-label="Контекст модели">
            <div>
              <strong>{context.cards.length}</strong>
              <span>карт класса в каталоге</span>
            </div>
            <div>
              <strong>{context.pairCoverage}</strong>
              <span>пар доступно для сравнения</span>
            </div>
            <div className="arena-draft-curve">
              <span>Целевая кривая 12W</span>
              <ol>
                {context.targetCurve.map(bucket => (
                  <li key={bucket.id}>
                    <strong>{bucket.label}</strong>
                    <span>{Math.round(bucket.targetShare * 100)}%</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="arena-draft-builder" aria-labelledby="arena-draft-deck-title">
            <div className="arena-draft-builder-heading">
              <div>
                <h4 id="arena-draft-deck-title">
                  <Gauge size={18} aria-hidden="true" /> Текущая колода
                </h4>
                <p>Добавляйте карты по одной.</p>
              </div>
              <span>{deckCardIds.length}/{context.deckSize}</span>
            </div>
            <div className="arena-draft-add-row">
              <label htmlFor="arena-draft-deck-card">Карта для добавления</label>
              <select
                id="arena-draft-deck-card"
                value={cardToAdd}
                onChange={event => setCardToAdd(event.target.value)}
                disabled={deckCardIds.length >= context.deckSize}
              >
                <option value="">Выберите карту</option>
                {cards.map(card => (
                  <option key={card.id} value={card.id}>
                    {card.name} · {card.cost ?? '—'} маны
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="contest-secondary-button"
                onClick={addDeckCard}
                disabled={!cardToAdd || deckCardIds.length >= context.deckSize}
              >
                <Plus size={16} aria-hidden="true" /> Добавить
              </button>
            </div>
            {deckCardIds.length ? (
              <ol className="arena-draft-deck-list" aria-label="Карты текущей колоды">
                {deckCardIds.map((id, index) => {
                  const card = cardsById.get(id);
                  if (!card) return null;
                  return (
                    <li key={`${id}-${index}`}>
                      <span>{card.cost ?? '—'}</span>
                      <strong>{card.name}</strong>
                      <button
                        type="button"
                        onClick={() => setDeckCardIds(current => (
                          current.filter((_item, itemIndex) => itemIndex !== index)
                        ))}
                        aria-label={`Убрать ${card.name} из колоды`}
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="arena-draft-empty-deck">
                Колода пока пуста. Совет всё равно работает, но без бонусов связок.
              </p>
            )}
          </section>

          <fieldset className="arena-draft-candidates">
            <legend>Три предложенные карты</legend>
            <p>Выберите карты в том же порядке, в котором видите их в игре.</p>
            <div>
              {CANDIDATE_SLOTS.map((slot, index) => (
                <label key={slot.id} htmlFor={`arena-draft-candidate-${slot.id}`}>
                  <span>Вариант {slot.label}</span>
                  <select
                    id={`arena-draft-candidate-${slot.id}`}
                    value={candidateIds[index]}
                    onChange={event => setCandidate(index, event.target.value)}
                  >
                    <option value="">Выберите карту</option>
                    {cards.map(card => (
                      <option
                        key={card.id}
                        value={card.id}
                        disabled={candidateIds.some((id, candidateIndex) => (
                          candidateIndex !== index && id === card.id
                        ))}
                      >
                        {card.name} · {card.cost ?? '—'} маны
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="arena-draft-actions">
            <button type="button" className="contest-secondary-button" onClick={reset}>
              Очистить черновик
            </button>
            <small>Расчёт обновляется автоматически после выбора трёх карт.</small>
          </div>

          {adviceState.error && (
            <div className="arena-synergy-message is-error" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{adviceState.error}</span>
            </div>
          )}

          <output className="arena-draft-results" aria-live="polite">
            {adviceState.advice ? (
              <>
                {adviceState.advice.isCloseDecision && (
                  <div className="arena-synergy-message is-warning">
                    <AlertTriangle size={18} aria-hidden="true" />
                    <span>
                      Два лидера отличаются меньше чем на 2 пункта — считайте их
                      практически равными и проверьте типы карт вручную.
                    </span>
                  </div>
                )}
                <div className="arena-draft-choice-grid">
                  {adviceState.advice.choices.map(choice => (
                    <AdviceCard
                      key={choice.card.id}
                      choice={choice}
                      isWinner={choice.rank === 1}
                      model={adviceState.advice.model}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="arena-draft-placeholder">
                <Sparkles size={22} aria-hidden="true" />
                <strong>Рейтинг появится здесь</strong>
                <span>Заполните три предложенные карты.</span>
              </div>
            )}
          </output>

          <details className="arena-draft-limitations">
            <summary>Что этот совет пока не учитывает</summary>
            <ul>
              {context.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}
            </ul>
          </details>
        </>
      ) : null}
    </div>
  );
}
