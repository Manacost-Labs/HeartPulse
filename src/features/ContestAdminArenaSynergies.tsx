import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Combine,
  Info,
  RefreshCw,
  Repeat2,
} from 'lucide-react';
import type {
  ArenaClassId,
  ArenaRedraftCard,
  ArenaSynergyCard,
  ArenaSynergyPayload,
} from '../../shared/arenaSynergyContract';
import './ContestAdminArenaSynergies.css';

type AnalyticsTab = 'combinations' | 'redraft';
type RedraftSort = 'added' | 'discarded' | 'net' | 'decisions';

export type ArenaSynergyPanelProps = {
  payload: ArenaSynergyPayload | null;
  loading: boolean;
  error: string | null;
  selectedClass: ArenaClassId;
  onClassChange: (className: ArenaClassId) => void;
  onReload: () => void;
};

function cardImage(cardId: string): string {
  return `https://art.hearthstonejson.com/v1/tiles/${encodeURIComponent(cardId)}.webp`;
}

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

function CardIdentity({ card }: { card: ArenaSynergyCard }) {
  return (
    <span className="arena-synergy-card">
      <span className="arena-synergy-card-art" aria-hidden="true">
        <span>{card.cost ?? '•'}</span>
        <img
          src={cardImage(card.id)}
          alt=""
          loading="lazy"
          width={48}
          height={36}
          onError={event => { event.currentTarget.hidden = true; }}
        />
      </span>
      <span>
        <strong>{card.name}</strong>
        <small>
          {card.cost != null ? `${card.cost} маны` : 'Мана —'}
          {' · '}
          {card.deckWinRate != null ? `WR ${formatPercent(card.deckWinRate)}` : `в ${card.runs} колодах`}
        </small>
      </span>
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
          <span className="arena-synergy-cohort">
            Когорта {payload.cohort.patchVersion ? `патча ${payload.cohort.patchVersion}` : 'без патча'}
            {' · '}
            {payload.cohort.poolFingerprint.slice(0, 8)}
          </span>
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
          </div>

          {payload.summary.warnings.map(warning => (
            <output key={warning} className="arena-synergy-message is-warning">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{warning}</span>
            </output>
          ))}

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
          </div>

          {tab === 'combinations' && (
            <div role="tabpanel" className="arena-synergy-section">
              <div className="arena-synergy-section-heading">
                <div>
                  <h3>Связки чаще ожидаемого</h3>
                  <p>
                    Lift 1,50 означает: пара встречается вместе примерно в 1,5 раза чаще
                    ожидаемого для этих же карт и классов.
                  </p>
                </div>
                <span>{payload.combinations.length} связок</span>
              </div>
              {payload.combinations.length ? (
                <div className="arena-synergy-table-wrap">
                  <table className="arena-synergy-table">
                    <caption className="sr-only">Сильные сочетания карт Арены</caption>
                    <thead>
                      <tr>
                        <th scope="col">Карты</th>
                        <th scope="col">Вместе</th>
                        <th scope="col">Ожидалось</th>
                        <th scope="col">Lift</th>
                        <th scope="col">Сигнал</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.combinations.map(combination => (
                        <tr key={combination.cards.map(card => card.id).join(':')}>
                          <td data-label="Карты">
                            <div className="arena-synergy-pair">
                              <CardIdentity card={combination.cards[0]} />
                              <span aria-hidden="true">+</span>
                              <CardIdentity card={combination.cards[1]} />
                            </div>
                          </td>
                          <td data-label="Вместе">
                            <strong>{combination.observedRuns}</strong>
                            <small>{formatPercent(combination.supportPercent)} колод</small>
                          </td>
                          <td data-label="Ожидалось">{combination.expectedRuns.toLocaleString('ru-RU')}</td>
                          <td data-label="Lift"><strong>×{combination.lift.toFixed(2)}</strong></td>
                          <td data-label="Сигнал">
                            <span className={`arena-synergy-confidence is-${combination.confidence}`}>
                              {confidenceLabel(combination.confidence)}
                            </span>
                            <small>оценка {combination.score}/100</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
          )}

          {tab === 'redraft' && (
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
                    className={redraftSort === value ? 'is-active' : ''}
                    aria-pressed={redraftSort === value}
                    onClick={() => setRedraftSort(value)}
                  >
                    <Icon size={16} aria-hidden="true" /> {label}
                  </button>
                ))}
              </fieldset>
              {redraftRows.length ? (
                <div className="arena-synergy-table-wrap">
                  <table className="arena-synergy-table arena-redraft-table">
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
                      {redraftRows.map(row => (
                        <tr key={row.card.id}>
                          <td data-label="Карта"><CardIdentity card={row.card} /></td>
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
                </div>
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
          )}

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

export default function ContestAdminArenaSynergies() {
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
