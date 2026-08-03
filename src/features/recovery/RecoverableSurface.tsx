import React from 'react';
import type { AppErrorKind } from '../../components/appErrorRecovery';
import { classifyAppError, createIncidentId, registerAppIncident } from '../../components/appErrorRecovery';

export type AsyncSurfaceVariant = 'loading' | 'empty' | 'error' | 'stale';

type AsyncSurfaceStateProps = {
  variant: AsyncSurfaceVariant;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
};

const STATE_MARKS: Record<AsyncSurfaceVariant, string> = {
  loading: '···',
  empty: '○',
  error: '!',
  stale: '↻',
};

export function AsyncSurfaceState({
  variant,
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
  className = '',
}: AsyncSurfaceStateProps) {
  const role = variant === 'error' ? 'alert' : 'status';
  return (
    <div
      className={`recoverable-surface recoverable-surface--${variant}${compact ? ' recoverable-surface--compact' : ''}${className ? ` ${className}` : ''}`}
      data-recovery-state={variant}
      role={role}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      aria-busy={variant === 'loading' ? 'true' : undefined}
    >
      <span className="recoverable-surface__mark" aria-hidden="true">{STATE_MARKS[variant]}</span>
      <div className="recoverable-surface__copy">
        <strong>{title}</strong>
        {message && <span>{message}</span>}
      </div>
      {actionLabel && onAction && (
        <button type="button" className="recoverable-surface__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

type RecoverableFailure = {
  kind: AppErrorKind;
  incidentId: string;
};

type RecoverableSurfaceBoundaryProps = React.PropsWithChildren<{
  scope: string;
  title?: string;
  message?: string;
  className?: string;
}>;

type RecoverableSurfaceBoundaryState = {
  failure: RecoverableFailure | null;
  retryRevision: number;
};

export class RecoverableSurfaceBoundary extends React.Component<
  RecoverableSurfaceBoundaryProps,
  RecoverableSurfaceBoundaryState
> {
  declare readonly props: RecoverableSurfaceBoundaryProps;
  declare setState: (
    updater: (previous: RecoverableSurfaceBoundaryState) => RecoverableSurfaceBoundaryState,
  ) => void;
  state: RecoverableSurfaceBoundaryState = { failure: null, retryRevision: 0 };

  static getDerivedStateFromError(error: unknown): Pick<RecoverableSurfaceBoundaryState, 'failure'> {
    return {
      failure: {
        kind: classifyAppError(error),
        incidentId: createIncidentId(),
      },
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const { failure } = this.state;
    if (!failure) return;
    registerAppIncident(failure.incidentId, {
      kind: failure.kind,
      releaseId: typeof __APP_RELEASE_SHA__ === 'string' ? __APP_RELEASE_SHA__ : 'development',
      error,
      componentStack: info.componentStack ?? '',
      scope: this.props.scope,
    });
    console.error('[recoverable-surface]', JSON.stringify({
      scope: this.props.scope,
      kind: failure.kind,
      incidentId: failure.incidentId,
    }));
  }

  private handleRetry = (): void => {
    if (this.state.failure?.kind === 'chunk') {
      window.location.reload();
      return;
    }
    this.setState(previous => ({
      failure: null,
      retryRevision: previous.retryRevision + 1,
    }));
  };

  render(): React.ReactNode {
    const { failure, retryRevision } = this.state;
    if (failure) {
      const chunkFailure = failure.kind === 'chunk';
      return (
        <div className={`recoverable-surface-boundary${this.props.className ? ` ${this.props.className}` : ''}`}>
          <AsyncSurfaceState
            variant="error"
            title={chunkFailure ? 'Раздел нужно обновить' : (this.props.title || 'Раздел временно недоступен')}
            message={chunkFailure
              ? 'Новая версия раздела уже доступна. Обновите страницу, чтобы продолжить.'
              : (this.props.message || 'Остальные разделы сайта продолжают работать. Попробуйте ещё раз.')}
            actionLabel={chunkFailure ? 'Обновить страницу' : 'Повторить'}
            onAction={this.handleRetry}
          />
          <span className="recoverable-surface-boundary__incident">Код ошибки: {failure.incidentId}</span>
        </div>
      );
    }
    return <React.Fragment key={retryRevision}>{this.props.children}</React.Fragment>;
  }
}
