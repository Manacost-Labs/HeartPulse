import React from 'react';
import { AlertCircle, RefreshCw, ServerOff } from 'lucide-react';
import type { ParserControlError } from './error';
import type { ParserControlWarning } from './types';

export function ParserControlLoading() {
  return (
    <section className="contest-admin-card admin-parser-loading" aria-busy="true" aria-live="polite">
      <RefreshCw size={22} className="is-spinning" aria-hidden="true" />
      <div><strong>Загружаем управление данными</strong><span>Проверяем режим, источники и последние запуски.</span></div>
    </section>
  );
}

export function ParserControlInitialError({
  error,
  onRetry,
}: {
  error: ParserControlError;
  onRetry: () => void;
}) {
  const Icon = error.unavailable ? ServerOff : AlertCircle;
  return (
    <section className={`contest-admin-card admin-parser-error ${error.unavailable ? 'is-unavailable' : ''}`} role={error.unavailable ? 'status' : 'alert'}>
      <Icon size={26} aria-hidden="true" />
      <div>
        <strong>{error.unavailable ? 'Управление парсерами не подключено' : 'Не удалось загрузить панель'}</strong>
        <span>{error.message}</span>
        {error.unavailable && <small>Добавьте серверный ключ HS_DATA_API_ADMIN_KEY. Он не передаётся в браузер.</small>}
      </div>
      <button type="button" className="contest-secondary-button" onClick={onRetry}>Повторить</button>
    </section>
  );
}

export function ParserControlAlerts({
  error,
  warnings,
  refreshing,
  onRetry,
}: {
  error: ParserControlError | null;
  warnings: ParserControlWarning[];
  refreshing: boolean;
  onRetry: () => void;
}) {
  return (
    <>
      {error && (
        <div className="admin-parser-inline-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error.message}</span>
          <button type="button" disabled={refreshing} onClick={onRetry}>Повторить</button>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="admin-parser-inline-warning" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Настройки сохранены с предупреждением</strong>
            {warnings.map(warning => (
              <span key={`${warning.code}:${warning.requestId ?? 'no-request'}:${warning.message}`}>
                {warning.message}
                {warning.requestId && <code>Код запроса: {warning.requestId}</code>}
              </span>
            ))}
          </div>
          <button type="button" disabled={refreshing} onClick={onRetry}>Обновить статусы</button>
        </div>
      )}
    </>
  );
}
