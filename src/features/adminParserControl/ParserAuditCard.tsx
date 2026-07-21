import React from 'react';
import { AlertCircle, History, RefreshCw, UserRound } from 'lucide-react';
import { formatAdminDate } from './format';
import type { ParserAuditEntry } from './types';

const ACTION_LABEL: Record<string, string> = {
  'parser-control.policy.update': 'Режим публикации изменён',
  'parser-control.sections.update': 'Автообновление разделов изменено',
  'parser-control.run.create': 'Запущено ручное обновление',
  'parser-control.cache-invalidation.warning': 'Предупреждение об очистке кеша',
};

function auditSnapshot(value: Record<string, unknown> | null): string {
  if (!value) return 'Снимок не записан';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return 'Снимок не удалось прочитать';
  }
}

export function ParserAuditCard({
  entries,
  loading,
  error,
  onRefresh,
}: {
  entries: ParserAuditEntry[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <section
      className="contest-admin-card admin-parser-card admin-parser-audit"
      aria-labelledby="parser-audit-title"
      aria-busy={loading}
    >
      <div className="admin-card-heading admin-parser-card__heading">
        <div>
          <h2 id="parser-audit-title"><History size={21} /> Журнал изменений</h2>
          <p className="contest-muted">Кто и когда менял режим, разделы или запускал обновление вручную.</p>
        </div>
        <button type="button" className="contest-secondary-button" disabled={loading} onClick={onRefresh}>
          <RefreshCw size={16} className={loading ? 'is-spinning' : ''} aria-hidden="true" />
          {loading ? 'Обновляем…' : 'Обновить журнал'}
        </button>
      </div>

      {error && (
        <div className="admin-parser-run-load-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div><strong>Не удалось загрузить журнал</strong><span>{error}</span></div>
          <button type="button" disabled={loading} onClick={onRefresh}>Повторить</button>
        </div>
      )}

      {!error && loading && entries.length === 0 && (
        <p className="admin-parser-empty" role="status" aria-live="polite">Загружаем журнал изменений…</p>
      )}

      {!error && !loading && entries.length === 0 && (
        <p className="admin-parser-empty" role="status">Изменений в панели ещё не было.</p>
      )}

      {entries.length > 0 && (
        <ol className="admin-parser-audit__list" aria-label="Последние изменения панели парсеров">
          {entries.map(entry => {
            const actionLabel = ACTION_LABEL[entry.action] || 'Изменение панели парсеров';
            const actor = entry.actorName || entry.actorId || 'Администратор';
            return (
              <li key={entry.id} className="admin-parser-audit__entry">
                <div className="admin-parser-audit__head">
                  <div>
                    <strong>{entry.summary || actionLabel}</strong>
                    <code>{entry.action || 'parser-control.unknown'}</code>
                  </div>
                  <time dateTime={entry.createdAt || undefined}>{formatAdminDate(entry.createdAt)}</time>
                </div>
                <div className="admin-parser-audit__meta">
                  <span><UserRound size={14} aria-hidden="true" /> {actor}</span>
                  <span>{entry.revision != null ? `Ревизия ${entry.revision}` : 'Ревизия не менялась'}</span>
                  <span>Объект: <code>{entry.entityId || '—'}</code></span>
                  <span>Request ID: <code>{entry.requestId || 'не записан'}</code></span>
                </div>
                <details className="admin-parser-audit__details">
                  <summary>Показать состояние до и после</summary>
                  <div>
                    <section aria-label="Состояние до изменения">
                      <h3>До</h3>
                      <pre>{auditSnapshot(entry.before)}</pre>
                    </section>
                    <section aria-label="Состояние после изменения">
                      <h3>После</h3>
                      <pre>{auditSnapshot(entry.after)}</pre>
                    </section>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
