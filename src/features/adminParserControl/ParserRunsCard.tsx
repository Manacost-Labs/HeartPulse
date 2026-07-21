import React, { useEffect, useState } from 'react';
import { History, Play, RefreshCw } from 'lucide-react';
import { formatAdminDate, RUN_LABEL } from './format';
import type { ParserRun, ParserSection } from './types';

export function ParserRunsCard({
  sections,
  runs,
  starting,
  refreshing,
  onStart,
  onRefresh,
}: {
  sections: ParserSection[];
  runs: ParserRun[];
  starting: boolean;
  refreshing: boolean;
  onStart: (sectionIds: string[], reason: string) => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  useEffect(() => {
    setSelected(current => new Set([...current].filter(id => sections.some(section => section.id === id))));
  }, [sections]);

  const start = () => {
    if (!selected.size) return;
    onStart([...selected], reason.trim());
  };

  return (
    <section className="contest-admin-card admin-parser-card" aria-labelledby="parser-runs-title">
      <div className="admin-card-heading admin-parser-card__heading">
        <div>
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
            <label key={section.id}>
              <input
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
        <label>
          Причина запуска <span>(необязательно)</span>
          <input value={reason} maxLength={300} placeholder="Например: проверка данных после патча" onChange={event => setReason(event.target.value)} />
        </label>
        <button type="button" className="contest-primary-button" disabled={starting || !selected.size} onClick={start}>
          <Play size={17} /> {starting ? 'Добавляем в очередь…' : `Запустить${selected.size ? ` · ${selected.size}` : ''}`}
        </button>
      </div>

      <div className="admin-parser-run-history">
        <div className="admin-parser-run-history__title"><History size={18} /><h3>Последние запуски</h3></div>
        {runs.length ? runs.slice(0, 8).map(run => {
          const progress = run.totalSources > 0 ? Math.min(100, Math.round((run.completedSources / run.totalSources) * 100)) : 0;
          return (
            <article key={run.id} className="admin-parser-run">
              <div className="admin-parser-run__head">
                <strong>{run.reason || 'Ручное обновление'}</strong>
                <span className={`admin-parser-run__status is-${run.status}`}>{RUN_LABEL[run.status]}</span>
              </div>
              <div className="admin-parser-run__meta">
                <span>{formatAdminDate(run.requestedAt)}</span>
                <span>{run.totalSources || run.sourceIds.length} источников</span>
                {run.completedSources > 0 && <span>{run.completedSources} завершено</span>}
                {run.failedSources > 0 && <span className="has-error">{run.failedSources} с ошибкой</span>}
                {run.requestedBy && <span>{run.requestedBy}</span>}
              </div>
              {['queued', 'running'].includes(run.status) && (
                <div className="admin-parser-progress" aria-label={`Выполнено ${progress}%`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
              )}
              {run.error && <p className="admin-parser-run__error">{run.error}</p>}
            </article>
          );
        }) : <p className="admin-parser-empty" role="status">Ручных запусков ещё не было.</p>}
      </div>
    </section>
  );
}
