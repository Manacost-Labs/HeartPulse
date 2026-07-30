import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  Combine,
  Info,
  RefreshCw,
  Repeat2,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import type {
  ArenaCombination,
  ArenaClassId,
  ArenaRedraftCard,
  ArenaSynergyPayload,
} from '../../shared/arenaSynergyContract';
import { ArenaDraftAdvisorPanel } from './ArenaDraftAdvisorPanel';
import { ArenaSynergyCardIdentity } from './ArenaSynergyCardIdentity';
import './ContestAdminArenaSynergies.css';

type AnalyticsTab = 'combinations' | 'redraft' | 'advisor';
type RedraftSort = 'added' | 'discarded' | 'net' | 'decisions';
type PairClassification = NonNullable<ArenaCombination['classification']>;
type DisplayClassification = PairClassification | 'legacy';
type ArenaAdminView = 'synergies' | 'draft-assistant';

const ContestAdminArenaDraftAssistant = React.lazy(
  () => import('./ContestAdminArenaDraftAssistant'),
);

const PAIR_CLASSIFICATION_ORDER: DisplayClassification[] = [
  'confirmed',
  'promising',
  'popular',
  'legacy',
];

const PAIR_CLASSIFICATION_META = {
  confirmed: {
    label: 'Подтверждена',
    explanation: 'Выше похожих колод, данных достаточно',
    Icon: BadgeCheck,
  },
  promising: {
    label: 'Перспективная',
    explanation: 'Эффект есть, но нужно больше подтверждений',
    Icon: Sparkles,
  },
  popular: {
    label: 'Просто популярная',
    explanation: 'Часто вместе, отдельный эффект не доказан',
    Icon: UsersRound,
  },
  legacy: {
    label: 'Старый расчёт',
    explanation: 'Для сохранённого снимка контроль ещё не рассчитывался',
    Icon: AlertTriangle,
  },
} as const;

export type ArenaSynergyPanelProps = {
  payload: ArenaSynergyPayload | null;
  loading: boolean;
  error: string | null;
  selectedClass: ArenaClassId;
  onClassChange: (className: ArenaClassId) => void;
  onReload: () => void;
};

function formatDate(value: string | null, withTime = false): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return '—';
  return `${formatDate(from)} — ${formatDate(to)}`;
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function confidenceLabel(value: 'high' | 'medium' | 'exploratory'): string {
  if (value === 'high') return 'Высокая';
  if (value === 'medium') return 'Средняя';
  return 'Предварительная';
}

function qualityLabel(value: ArenaSynergyPayload['dataQuality']['status']): string {
  if (value === 'healthy') return 'Данные в норме';
  if (value === 'warning') return 'Есть предупреждения';
  return 'Расчёт заблокирован';
}

function sampleModeLabel(value: ArenaSynergyPayload['reliability']['sampleMode']): string {
  if (value === 'stable') return 'Стабильная выборка';
  if (value === 'warming') return 'Новая когорта набирает данные';
  if (value === 'last-known-good') return 'Последний надёжный расчёт';
  return 'Слишком мало данных';
}

function interactionLabel(value: ArenaSynergyPayload['combinations'][number]['interactionSignal']): string {
  if (value === 'positive') return 'Есть дополнительный эффект';
  if (value === 'negative') return 'Вместе слабее ожидания';
  if (value === 'neutral') return 'Без заметного прироста';
  return 'Мало данных';
}

function displayClassification(combination: ArenaCombination): DisplayClassification {
  return combination.classification ?? 'legacy';
}

function PairClassificationBadge({ value }: { value: DisplayClassification }) {
  const { Icon, label } = PAIR_CLASSIFICATION_META[value];

  return (
    <span className={`arena-synergy-classification is-${value}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}

function sortRedraft(rows: ArenaRedraftCard[], sort: RedraftSort): ArenaRedraftCard[] {
  return [...rows].sort((left, right) => {
    if (sort === 'added') return right.addedCopies - left.addedCopies || right.decisions - left.decisions;
    if (sort === 'discarded') return right.discardedCopies - left.discardedCopies || right.decisions - left.decisions;
    if (sort === 'net') return right.netCopies - left.netCopies || right.addedCopies - left.addedCopies;
    return right.decisions - left.decisions || Math.abs(right.netCopies) - Math.abs(left.netCopies);
  });
}

function ArenaDataQualityPanel({ payload }: { payload: ArenaSynergyPayload }) {
  return (
    <details className="arena-synergy-quality">
      <summary>
        Проверка входных данных
        <span className={`is-${payload.dataQuality.status}`}>
          {qualityLabel(payload.dataQuality.status)} · {payload.dataQuality.score}/100
        </span>
      </summary>
      <div className="arena-synergy-quality-grid">
        {payload.dataQuality.checks.map(check => (
          <div key={check.id} className={`is-${check.status}`}>
            <strong>{check.label}</strong>
            <span>{check.message}</span>
            <small>Порог: {check.threshold}</small>
          </div>
        ))}
      </div>
    </details>
  );
}

function ArenaCombinationPanel({ payload }: { payload: ArenaSynergyPayload }) {
  const categoryCounts = payload.combinations.reduce<Record<DisplayClassification, number>>(
    (counts, combination) => {
      counts[displayClassification(combination)] += 1;
      return counts;
    },
    { confirmed: 0, promising: 0, popular: 0, legacy: 0 },
  );

  return (
    <div role="tabpanel" className="arena-synergy-section">
      <div className="arena-synergy-section-heading">
        <div>
          <h3>Связки и дополнительный эффект пары</h3>
          <p>
            Каждая пара сравнивается с похожими колодами того же класса и патча,
            но без обеих карт. Lift показывает только совместную популярность.
          </p>
        </div>
        <span>{payload.combinations.length} связок</span>
      </div>
      {payload.combinations.length ? (
        <>
          <ul className="arena-synergy-category-summary" aria-label="Распределение связок по надёжности">
            {PAIR_CLASSIFICATION_ORDER.map(classification => {
              if (classification === 'legacy' && categoryCounts.legacy === 0) return null;
              return (
                <li key={classification}>
                  <PairClassificationBadge value={classification} />
                  <strong>{categoryCounts[classification]}</strong>
                  <small>{PAIR_CLASSIFICATION_META[classification].explanation}</small>
                </li>
              );
            })}
          </ul>
          <section
            className="arena-synergy-table-wrap"
            aria-label="Таблица сочетаний карт"
          >
            <table className="arena-synergy-table" tabIndex={0}>
              <caption className="sr-only">Сильные сочетания карт Арены</caption>
              <thead>
                <tr>
                  <th scope="col">Карты</th>
                  <th scope="col">Вместе</th>
                  <th scope="col">Ожидалось</th>
                  <th scope="col">Lift</th>
                  <th scope="col">Эффект пары</th>
                  <th scope="col">Вердикт</th>
                </tr>
              </thead>
              <tbody>
                {payload.combinations.map(combination => {
                  const controlledDelta = combination.controlledInteractionDeltaPoints
                    ?? combination.adjustedInteractionDeltaPoints;
                  const matchedControl = combination.matchedControl;

                  return (
                    <tr key={combination.cards.map(card => card.id).join(':')}>
                      <td data-label="Карты">
                        <div className="arena-synergy-pair">
                          <ArenaSynergyCardIdentity card={combination.cards[0]} />
                          <span aria-hidden="true">+</span>
                          <ArenaSynergyCardIdentity card={combination.cards[1]} />
                        </div>
                      </td>
                      <td data-label="Вместе">
                        <strong>{combination.observedRuns}</strong>
                        <small>{formatPercent(combination.supportPercent)} колод</small>
                      </td>
                      <td data-label="Ожидалось">{combination.expectedRuns.toLocaleString('ru-RU')}</td>
                      <td data-label="Lift">
                        <strong>×{combination.adjustedLift.toFixed(2)}</strong>
                        {combination.historicalWeight > 0 && (
                          <small>
                            текущий ×{combination.lift.toFixed(2)}
                            {' · '}история {formatPercent(combination.historicalWeight * 100)}
                          </small>
                        )}
                      </td>
                      <td data-label="Эффект пары">
                        <strong className={`arena-synergy-interaction is-${combination.interactionSignal}`}>
                          {controlledDelta > 0 ? '+' : ''}
                          {controlledDelta.toFixed(1)} п.п.
                        </strong>
                        {matchedControl ? (
                          <>
                            <small>
                              пара {formatPercent(matchedControl.pairRunQuality)}
                              {' · '}контроль {formatPercent(matchedControl.controlRunQuality)}
                            </small>
                            <small>
                              {matchedControl.pairRuns} с парой
                              {' · '}{matchedControl.controlRuns} похожих
                              {' · '}сходство {formatPercent(matchedControl.averageSimilarity * 100)}
                            </small>
                            <small>
                              {matchedControl.distinctDays} дн.
                              {' · '}{matchedControl.distinctPlayers} игроков
                              {' · '}макс. игрок {formatPercent(matchedControl.maxPlayerShare * 100)}
                            </small>
                          </>
                        ) : (
                          <small>Контрольных колод нет в сохранённом старом расчёте.</small>
                        )}
                        <small>
                          A без B {formatPercent(combination.interactionEvidence.cardAQuality)}
                          {' · '}B без A {formatPercent(combination.interactionEvidence.cardBQuality)}
                        </small>
                      </td>
                      <td data-label="Вердикт">
                        <PairClassificationBadge value={displayClassification(combination)} />
                        <small>
                          Доверие: {confidenceLabel(combination.confidence).toLocaleLowerCase('ru-RU')}
                          {' · '}оценка {combination.score}/100
                        </small>
                        <small>{interactionLabel(combination.interactionSignal)}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <output className="arena-synergy-empty">
          Для выбранного класса пока нет связок, прошедших порог выборки и lift.
        </output>
      )}
      <div className="arena-synergy-method">
        <Info size={17} aria-hidden="true" />
        <p>
          {payload.methodology.note}
          {' '}Порог: от {payload.methodology.minimumPairRuns} совместных колод,
          lift от {payload.methodology.minimumLift.toFixed(2)}.
        </p>
      </div>
    </div>
  );
}

function ArenaRedraftPanel({
  rows,
  sort,
  onSort,
}: {
  rows: ArenaRedraftCard[];
  sort: RedraftSort;
  onSort: (sort: RedraftSort) => void;
}) {
  return (
    <div role="tabpanel" className="arena-synergy-section">
      <div className="arena-synergy-section-heading">
        <div>
          <h3>Что забирают и что сбрасывают</h3>
          <p>Количество копий во всех redraft выбранной выборки.</p>
        </div>
      </div>
      <fieldset className="arena-redraft-sort" aria-label="Сортировка redraft">
        {([
          ['added', 'Чаще добавляют', ArrowDownToLine],
          ['discarded', 'Чаще сбрасывают', ArrowUpFromLine],
          ['net', 'Лучший баланс', Combine],
          ['decisions', 'Все решения', Repeat2],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            className={sort === value ? 'is-active' : ''}
            aria-pressed={sort === value}
            onClick={() => onSort(value)}
          >
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </fieldset>
      {rows.length ? (
        <section
          className="arena-synergy-table-wrap"
          aria-label="Таблица решений redraft"
        >
          <table className="arena-synergy-table arena-redraft-table" tabIndex={0}>
            <caption className="sr-only">Статистика добавлений и сбросов redraft</caption>
            <thead>
              <tr>
                <th scope="col">Карта</th>
                <th scope="col">Добавили</th>
                <th scope="col">Сбросили</th>
                <th scope="col">Баланс</th>
                <th scope="col">Доля добавлений</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.card.id}>
                  <td data-label="Карта"><ArenaSynergyCardIdentity card={row.card} /></td>
                  <td data-label="Добавили">
                    <strong>+{row.addedCopies}</strong>
                    <small>{row.addedRuns} забегов</small>
                  </td>
                  <td data-label="Сбросили">
                    <strong>−{row.discardedCopies}</strong>
                    <small>{row.discardedRuns} забегов</small>
                  </td>
                  <td data-label="Баланс">
                    <strong>{row.netCopies > 0 ? '+' : ''}{row.netCopies}</strong>
                  </td>
                  <td data-label="Доля добавлений">
                    {formatPercent(row.addShare * 100)}
                    <small>{row.decisions} решений</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <output className="arena-synergy-empty">
          В выбранной выборке нет данных redraft.
        </output>
      )}
      <div className="arena-synergy-method">
        <Info size={17} aria-hidden="true" />
        <p>
          Источник не связывает конкретную сброшенную карту с конкретной добавленной.
          Поэтому здесь показаны независимые частоты, а не пары замен.
        </p>
      </div>
    </div>
  );
}

function ArenaHistoryPanel({ payload }: { payload: ArenaSynergyPayload }) {
  if (!payload.history.length) return null;
  return (
    <div className="arena-synergy-history">
      <div className="arena-synergy-section-heading">
        <div>
          <h3>История патчей и пула</h3>
          <p>Снимки сохраняются отдельно и не смешиваются после смены когорты.</p>
        </div>
        <span>{payload.history.length} версий</span>
      </div>
      <div className="arena-synergy-history-list">
        {payload.history.slice(0, 6).map(item => (
          <article key={item.id}>
            <div>
              <strong>Патч {item.patchVersion ?? 'не определён'}</strong>
              <small>{item.poolFingerprint.slice(0, 8)} · {item.runsAnalyzed} забегов</small>
            </div>
            <span>{formatPeriod(item.from, item.to)}</span>
            {item.topCombination ? (
              <small>
                Лидер: {item.topCombination.cards.join(' + ')}
                {' · '}
                {item.topCombination.interactionDeltaPoints > 0 ? '+' : ''}
                {item.topCombination.interactionDeltaPoints.toFixed(1)} п.п.
              </small>
            ) : (
              <small>Надёжных сочетаний пока нет</small>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

export function ArenaSynergyPanel({
  payload,
  loading,
  error,
  selectedClass,
  onClassChange,
  onReload,
}: ArenaSynergyPanelProps) {
  const [tab, setTab] = useState<AnalyticsTab>('combinations');
  const [redraftSort, setRedraftSort] = useState<RedraftSort>('added');
  const redraftRows = useMemo(
    () => sortRedraft(payload?.redraft ?? [], redraftSort),
    [payload?.redraft, redraftSort],
  );

  return (
    <section className="contest-admin-card admin-full-card arena-synergy-panel" aria-labelledby="arena-synergy-title">
      <div className="arena-synergy-heading">
        <div>
          <h2 id="arena-synergy-title"><Combine size={21} /> Сочетания в Арене</h2>
          <p className="contest-muted">
            Связки в последних 12-победных колодах и реальные решения redraft.
            Популярность класса и обязательные легендарные пакеты отфильтрованы.
          </p>
        </div>
        <button
          type="button"
          className="contest-secondary-button"
          onClick={onReload}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? 'Обновляем…' : 'Обновить данные'}
        </button>
      </div>

      <div className="arena-synergy-toolbar">
        <label htmlFor="arena-synergy-class">Класс</label>
        <select
          id="arena-synergy-class"
          value={selectedClass}
          onChange={event => onClassChange(event.target.value as ArenaClassId)}
          disabled={loading && !payload}
        >
          {(payload?.availableClasses ?? [{ id: 'ALL' as const, label: 'Все классы', runs: 0 }])
            .map(option => (
              <option key={option.id} value={option.id}>
                {option.label} · {option.runs}
              </option>
            ))}
        </select>
        {payload && (
          <>
            <span className="arena-synergy-cohort">
              Когорта {payload.cohort.patchVersion ? `патча ${payload.cohort.patchVersion}` : 'без патча'}
              {' · '}
              {payload.cohort.poolFingerprint.slice(0, 8)}
            </span>
            <span className={`arena-synergy-source-mode is-${payload.reliability.servedFrom}`}>
              {sampleModeLabel(payload.reliability.sampleMode)}
            </span>
          </>
        )}
      </div>

      {error && (
        <div className="arena-synergy-message is-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading && !payload && !error && (
        <output className="arena-synergy-loading">
          <RefreshCw size={20} aria-hidden="true" />
          <span>Считаем сочетания на последних забегах…</span>
        </output>
      )}

      {payload && (
        <>
          <div className="admin-stat-grid arena-synergy-stats" aria-label="Сводка выборки">
            <div>
              <span>Забегов в расчёте</span>
              <strong>{payload.summary.runsAnalyzed}</strong>
              <small>
                12-0: {payload.summary.recordCounts['12-0'] ?? 0}
                {' · '}12-1: {payload.summary.recordCounts['12-1'] ?? 0}
                {' · '}12-2: {payload.summary.recordCounts['12-2'] ?? 0}
              </small>
            </div>
            <div>
              <span>Период</span>
              <strong className="arena-synergy-stat-period">
                {formatPeriod(payload.cohort.from, payload.cohort.to)}
              </strong>
              <small>только после текущего Arena-патча</small>
            </div>
            <div>
              <span>Активный патч</span>
              <strong>{payload.cohort.patchVersion ?? 'Не определён'}</strong>
              <small>с {formatDate(payload.cohort.patchPublishedAt)}</small>
            </div>
            <div>
              <span>Забегов с redraft</span>
              <strong>{payload.summary.redraftRuns}</strong>
              <small>из {payload.summary.runsAnalyzed} в выборке</small>
            </div>
            <div>
              <span>Качество данных</span>
              <strong>{payload.dataQuality.score}/100</strong>
              <small>{qualityLabel(payload.dataQuality.status)}</small>
            </div>
          </div>

          {payload.reliability.servedFrom === 'last-known-good' && (
            <div className="arena-synergy-message is-warning" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>
                Свежий источник не прошёл проверку. Показана сохранённая версия от{' '}
                {formatDate(payload.generatedAt, true)}.
              </span>
            </div>
          )}

          {payload.summary.warnings.map(warning => (
            <output key={warning} className="arena-synergy-message is-warning">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{warning}</span>
            </output>
          ))}

          <ArenaDataQualityPanel payload={payload} />

          <div className="arena-synergy-tabs" role="tablist" aria-label="Раздел аналитики">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'combinations'}
              className={tab === 'combinations' ? 'is-active' : ''}
              onClick={() => setTab('combinations')}
            >
              <Combine size={17} aria-hidden="true" /> Сочетания
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'redraft'}
              className={tab === 'redraft' ? 'is-active' : ''}
              onClick={() => setTab('redraft')}
            >
              <Repeat2 size={17} aria-hidden="true" /> Redraft
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'advisor'}
              className={tab === 'advisor' ? 'is-active' : ''}
              onClick={() => setTab('advisor')}
            >
              <Sparkles size={17} aria-hidden="true" /> Помощник драфта
            </button>
          </div>

          {tab === 'combinations' && <ArenaCombinationPanel payload={payload} />}
          {tab === 'redraft' && (
            <ArenaRedraftPanel rows={redraftRows} sort={redraftSort} onSort={setRedraftSort} />
          )}
          {tab === 'advisor' && (
            <ArenaDraftAdvisorPanel
              key={`${payload.cohort.id}:${payload.selectedClass}`}
              payload={payload}
            />
          )}
          <ArenaHistoryPanel payload={payload} />

          <p className="arena-synergy-updated">
            Расчёт обновлён {formatDate(payload.generatedAt, true)}
          </p>
        </>
      )}
    </section>
  );
}

async function fetchArenaSynergies(
  className: ArenaClassId,
  options: { signal?: AbortSignal; forceRefresh?: boolean } = {},
): Promise<ArenaSynergyPayload> {
  const params = new URLSearchParams({ class: className });
  if (options.forceRefresh) params.set('refresh', '1');
  const response = await fetch(`/api/admin/arena-synergies?${params}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  const result = await response.json().catch(() => ({})) as ArenaSynergyPayload & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || 'Не удалось загрузить сочетания Арены');
  }
  return result;
}

function ContestAdminArenaSynergyAnalysis() {
  const [payload, setPayload] = useState<ArenaSynergyPayload | null>(null);
  const [selectedClass, setSelectedClass] = useState<ArenaClassId>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (
    className: ArenaClassId,
    options: { signal?: AbortSignal; forceRefresh?: boolean } = {},
  ) => {
    if (options.signal?.aborted) return;
    setLoading(true);
    try {
      const next = await fetchArenaSynergies(className, options);
      options.signal?.throwIfAborted();
      setPayload(next);
      setError(null);
    } catch (caught) {
      if (options.signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить сочетания Арены');
    } finally {
      if (!options.signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(selectedClass, { signal: controller.signal });
    return () => controller.abort();
  }, [load, selectedClass]);

  return (
    <ArenaSynergyPanel
      payload={payload}
      loading={loading}
      error={error}
      selectedClass={selectedClass}
      onClassChange={setSelectedClass}
      onReload={() => void load(selectedClass, { forceRefresh: true })}
    />
  );
}

export default function ContestAdminArenaSynergies({
  view = 'synergies',
}: {
  view?: ArenaAdminView;
}) {
  if (view === 'draft-assistant') {
    return (
      <React.Suspense fallback={<p className="contest-muted" role="status">Готовим стол драфта…</p>}>
        <ContestAdminArenaDraftAssistant />
      </React.Suspense>
    );
  }

  return <ContestAdminArenaSynergyAnalysis />;
}
