import React from 'react';
import type { AppErrorKind } from './appErrorRecovery';

type AppErrorRecoveryScreenProps = {
  kind: AppErrorKind;
  incidentId: string;
  releaseId: string;
  onRetry: () => void;
  focusRef?: React.Ref<HTMLElement>;
};

export default function AppErrorRecoveryScreen({
  kind,
  incidentId,
  releaseId,
  onRetry,
  focusRef,
}: AppErrorRecoveryScreenProps) {
  const isChunkFailure = kind === 'chunk';
  return (
    <main className="app-error-shell" data-app-error="shell">
      <section
        ref={focusRef}
        className="app-error-card"
        role="alert"
        aria-labelledby="app-error-title"
        tabIndex={-1}
      >
        <div className="app-error-emblem" aria-hidden="true">!</div>
        <p className="app-error-eyebrow">Manacost Stats</p>
        <h1 id="app-error-title">
          {isChunkFailure ? 'Нужно обновить страницу' : 'Произошла ошибка интерфейса'}
        </h1>
        <p className="app-error-message">
          {isChunkFailure
            ? 'Не удалось загрузить часть новой версии сайта. Обновите страницу, чтобы продолжить.'
            : 'Страница временно не загрузилась. Попробуйте открыть её ещё раз.'}
        </p>
        <dl className="app-error-details" aria-label="Данные для службы поддержки">
          <div>
            <dt>Код ошибки</dt>
            <dd><code data-app-error-incident>{incidentId}</code></dd>
          </div>
          <div>
            <dt>Версия</dt>
            <dd><code data-app-error-release>{releaseId}</code></dd>
          </div>
        </dl>
        <div className="app-error-actions">
          <button type="button" className="app-error-action app-error-action--primary" onClick={onRetry}>
            {isChunkFailure ? 'Обновить страницу' : 'Повторить'}
          </button>
          <a className="app-error-action app-error-action--secondary" href="/">
            На главную
          </a>
        </div>
        <p className="app-error-support-note">
          Если ошибка повторится, отправьте код ошибки службе поддержки.
        </p>
      </section>
    </main>
  );
}
