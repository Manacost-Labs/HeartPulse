import React, { useEffect, useMemo, useRef } from 'react';
import { CopyCheck, X } from 'lucide-react';
import { formatAdminDate, HEALTH_LABEL, RUN_LABEL } from './format';
import type { ParserRun, ParserSection } from './types';

function sourceLabelsFor(sections: ParserSection[]) {
  return new Map(
    sections.flatMap(section => section.sources.map(source => [source.id, source.label] as const)),
  );
}

function RunSourceResults({ run, sections }: { run: ParserRun; sections: ParserSection[] }) {
  const sourceLabels = useMemo(() => sourceLabelsFor(sections), [sections]);

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

export function ParserRunDetailsDialog({
  run,
  sections,
  onClose,
}: {
  run: ParserRun;
  sections: ParserSection[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const progress = run.totalSources > 0
    ? Math.min(100, Math.round((run.completedSources / run.totalSources) * 100))
    : 0;

  useEffect(() => {
    dialogRef.current?.showModal();
    closeButtonRef.current?.focus();
  }, []);

  const requestClose = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      className="admin-parser-run-drawer"
      aria-modal="true"
      aria-labelledby="parser-run-details-title"
      onClose={onClose}
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
          onClick={requestClose}
          onKeyDown={event => {
            if (event.key !== 'Tab') return;
            event.preventDefault();
            closeButtonRef.current?.focus();
          }}
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
    </dialog>
  );
}
