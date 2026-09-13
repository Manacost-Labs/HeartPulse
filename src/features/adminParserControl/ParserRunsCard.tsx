import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  History,
  Play,
  RefreshCw,
} from 'lucide-react';
import { formatAdminDate, RUN_LABEL } from './format';
import type { ParserRun, ParserSection } from './types';

const ParserRunDetailsDialog = lazy(async () => {
  const module = await import('./ParserRunDetailsDialog');
  return { default: module.ParserRunDetailsDialog };
});

function runProgress(run: ParserRun) {
  if (run.totalSources <= 0) return 0;
  return Math.min(100, Math.round((run.completedSources / run.totalSources) * 100));
}

type ParserRunsCardProps = {
  sections: ParserSection[];
  runs: ParserRun[];
  starting: boolean;
  refreshing: boolean;
  loadError: string | null;
  onStart: (sectionIds: string[], reason: string) => void;
  onRefresh: () => void;
};

export function ParserRunsCard({
  sections, runs, starting, refreshing, loadError, onStart, onRefresh,
}: ParserRunsCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const selectedRun = runs.find(run => run.id === selectedRunId) ?? null;
  const closeSelectedRun = useCallback(() => setSelectedRunId(null), []);

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
                  <th scope="col" aria-label="Детали" />
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
                        <button type="button" className="admin-parser-run-open"
                          aria-label={`Открыть сведения о запуске ${run.id}`}
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
        <Suspense fallback={null}>
          <ParserRunDetailsDialog
            run={selectedRun}
            sections={sections}
            onClose={closeSelectedRun}
          />
        </Suspense>
      )}
    </section>
  );
}
