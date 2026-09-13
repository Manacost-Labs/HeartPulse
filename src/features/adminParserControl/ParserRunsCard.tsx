import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  CopyCheck,
  History,
  Play,
  RefreshCw,
  X,
} from 'lucide-react';
import { formatAdminDate, HEALTH_LABEL, RUN_LABEL } from './format';
import type { ParserRun, ParserSection } from './types';

function buildSourceLabels(sections: ParserSection[]) {
  return new Map(
    sections.flatMap(section => section.sources.map(source => [source.id, source.label] as const)),
  );
}

function runProgress(run: ParserRun) {
  if (run.totalSources <= 0) return 0;
  return Math.min(100, Math.round((run.completedSources / run.totalSources) * 100));
}

function RunSourceResults({ run, sections }: { run: ParserRun; sections: ParserSection[] }) {
  const sourceLabels = useMemo(() => buildSourceLabels(sections), [sections]);

  if (!run.results.length) {
    return <p className="admin-parser-empty" role="status">Результаты источников пока не получены.</p>;
  }

  return (
    <ul className="admin-parser-run-results" aria-label="Результаты источников">
      {run.results.map((result, index) => (
        <li key={`${result.sourceId}:${index}`} className={`is-${result.status}`}>
          <div className="admin-parser-run-result__identity">
            <strong>{sourceLabels.get(result.sourceId) || result.label}</strong>
            <code>{result.sourceId}</code>
          </div>
          <span className={`admin-parser-status is-${result.status}`}>
            <i aria-hidden="true" />
            {result.servingCachedDataset ? 'Показан сохранённый снимок' : HEALTH_LABEL[result.status]}
          </span>
          <dl>
            {result.rowsTotal != null && <div><dt>Записей</dt><dd>{result.rowsTotal.toLocaleString('ru-RU')}</dd></div>}
            {result.durationMs != null && <div><dt>Время</dt><dd>{Math.max(1, Math.round(result.durationMs / 1000))} с</dd></div>}
            {result.fetchedAt && <div><dt>Получено</dt><dd>{formatAdminDate(result.fetchedAt)}</dd></div>}
          </dl>
          {result.message && <p>{result.message}</p>}
          {result.errors.length > 0 && (
            <div className="admin-parser-run-result__error-block">
              <strong>Ошибки источника</strong>
              <ul className="admin-parser-run-result__errors">
                {result.errors.map((message, errorIndex) => (
                  <li key={`${result.sourceId}:error:${errorIndex}`}>{message}</li>
                ))}
                {result.errorsTruncated && (
                  <li className="is-summary">
                    Показаны первые {result.errors.length.toLocaleString('ru-RU')} из{' '}
                    {result.errorsTotal.toLocaleString('ru-RU')} ошибок.
                  </li>
                )}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ParserRunDetailsDrawer({
  run,
  sections,
  onClose,
}: {
  run: ParserRun;
  sections: ParserSection[];
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const progress = runProgress(run);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <div className="admin-parser-run-drawer-layer">
      <button
        type="button"
        className="admin-parser-run-drawer-backdrop"
        aria-label="Закрыть детали запуска"
        onClick={onClose}
      />
      <aside
        className="admin-parser-run-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="parser-run-details-title"
      >
        <header>
          <div>
            <span>Операционный журнал</span>
            <h3 id="parser-run-details-title">Детали запуска</h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Закрыть детали запуска"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="admin-parser-run-drawer__summary">
          <div>
            <strong>{run.reason || 'Ручное обновление'}</strong>
            <code>{run.id}</code>
          </div>
          <span className={`admin-parser-run__status is-${run.status}`}>{RUN_LABEL[run.status]}</span>
        </div>

        <dl className="admin-parser-run-drawer__meta">
          <div><dt>Запрошен</dt><dd>{formatAdminDate(run.requestedAt)}</dd></div>
          <div><dt>Оператор</dt><dd>{run.requestedBy || 'не указан'}</dd></div>
          <div><dt>Источники</dt><dd>{run.totalSources || run.sourceIds.length}</dd></div>
          <div><dt>Завершено</dt><dd>{run.completedSources}</dd></div>
        </dl>

        {['queued', 'running'].includes(run.status) && (
          <div className="admin-parser-progress" aria-label={`Выполнено ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        {run.error && <p className="admin-parser-run__error">{run.error}</p>}
        {run.deduplicated && (
          <p className="admin-parser-run__deduplicated">
            <CopyCheck size={16} aria-hidden="true" />
            {run.deduplicatedSourceIds.length > 0
              ? `${run.deduplicatedSourceIds.length} уже запущенных источников не добавлены повторно.`
              : 'Повторный запуск не создан: источники уже находятся в очереди.'}
          </p>
        )}

        <section aria-labelledby="parser-run-results-title">
          <div className="admin-parser-run-drawer__section-title">
            <h4 id="parser-run-results-title">Результаты источников</h4>
            <span>{run.results.length}</span>
          </div>
          <RunSourceResults run={run} sections={sections} />
        </section>
      </aside>
    </div>
  );
}

export function ParserRunsCard({
  sections,
  runs,
  starting,
  refreshing,
  loadError,
  onStart,
  onRefresh,
}: {
  sections: ParserSection[];
  runs: ParserRun[];
  starting: boolean;
  refreshing: boolean;
  loadError: string | null;
  onStart: (sectionIds: string[], reason: string) => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const selectedRun = runs.find(run => run.id === selectedRunId) ?? null;

  useEffect(() => {
    setSelected(current => new Set([...current].filter(id => sections.some(section => section.id === id))));
  }, [sections]);

  const start = () => {
    if (!selected.size) return;
    onStart([...selected], reason.trim());
  };

  return (
    <section className="contest-admin-card admin-parser-card admin-parser-runs-card" aria-labelledby="parser-runs-title">
      <div className="admin-card-heading admin-parser-card__heading">
        <div>
          <span className="admin-card-eyebrow">Ручное управление</span>
          <h2 id="parser-runs-title"><Play size={21} /> Обновить сейчас</h2>
          <p className="contest-muted">Разовый запуск не меняет режим публикации и настройки автообновления.</p>
        </div>
        <button type="button" className="contest-secondary-button" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} /> Обновить статусы
        </button>
      </div>

      <fieldset className="admin-parser-run-selection">
        <legend>Выберите разделы</legend>
        <div>
          {sections.map(section => (
            <label htmlFor={`parser-run-section-${section.id}`} key={section.id}>
              <input
                id={`parser-run-section-${section.id}`}
                name="parser-sections"
                type="checkbox"
                checked={selected.has(section.id)}
                onChange={event => setSelected(current => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(section.id); else next.delete(section.id);
                  return next;
                })}
              />
              <span><strong>{section.label}</strong><small>{section.sources.filter(source => source.canRunManually).length} доступно для запуска</small></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="admin-parser-run-actions">
        <label htmlFor="parser-run-reason">
          Причина запуска <span>(необязательно)</span>
          <input
            id="parser-run-reason"
            name="parser-run-reason"
            value={reason}
            maxLength={300}
            placeholder="Например: проверка данных после патча"
            onChange={event => setReason(event.target.value)}
          />
        </label>
        <button type="button" className="contest-primary-button" disabled={starting || !selected.size} onClick={start}>
          <Play size={17} /> {starting ? 'Добавляем в очередь…' : `Запустить${selected.size ? ` · ${selected.size}` : ''}`}
        </button>
      </div>

      <div className="admin-parser-run-history">
        <div className="admin-parser-run-history__title">
          <div><History size={18} /><h3>Последние запуски</h3></div>
          <span>{runs.length}</span>
        </div>
        {loadError && (
          <div className="admin-parser-run-load-error" role="alert" aria-live="assertive">
            <AlertCircle size={18} aria-hidden="true" />
            <div><strong>Не удалось обновить историю запусков</strong><span>{loadError}</span></div>
            <button type="button" disabled={refreshing} onClick={onRefresh}>Повторить</button>
          </div>
        )}
        {runs.length ? (
          <div className="admin-parser-run-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Запуск</th>
                  <th scope="col">Статус</th>
                  <th scope="col">Источники</th>
                  <th scope="col">Запрошен</th>
                  <th scope="col"><span className="sr-only">Детали</span></th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 8).map(run => {
                  const progress = runProgress(run);
                  return (
                    <tr key={run.id}>
                      <th scope="row">
                        <button
                          type="button"
                          className="admin-parser-run-link"
                          aria-label={`Открыть детали запуска: ${run.reason || 'Ручное обновление'}`}
                          onClick={() => setSelectedRunId(run.id)}
                        >
                          <strong>{run.reason || 'Ручное обновление'}</strong>
                          <code>{run.id}</code>
                        </button>
                        {run.deduplicated && (
                          <span className="admin-parser-run-table__deduplicated">
                            {run.deduplicatedSourceIds.length} уже запущенных источников не добавлены повторно
                          </span>
                        )}
                      </th>
                      <td><span className={`admin-parser-run__status is-${run.status}`}>{RUN_LABEL[run.status]}</span></td>
                      <td>
                        <strong>{run.completedSources} / {run.totalSources || run.sourceIds.length}</strong>
                        {run.failedSources > 0 && <small className="has-error">{run.failedSources} с ошибкой</small>}
                        {['queued', 'running'].includes(run.status) && (
                          <div className="admin-parser-progress" aria-label={`Выполнено ${progress}%`}>
                            <span style={{ width: `${progress}%` }} />
                          </div>
                        )}
                      </td>
                      <td><time dateTime={run.requestedAt || undefined}>{formatAdminDate(run.requestedAt)}</time></td>
                      <td>
                        <button
                          type="button"
                          className="admin-parser-run-open"
                          aria-label={`Открыть детали запуска: ${run.reason || 'Ручное обновление'}`}
                          onClick={() => setSelectedRunId(run.id)}
                        >
                          <ChevronRight size={18} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : !loadError ? <p className="admin-parser-empty" role="status">Ручных запусков ещё не было.</p> : null}
      </div>

      {selectedRun && (
        <ParserRunDetailsDrawer
          run={selectedRun}
          sections={sections}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </section>
  );
}
