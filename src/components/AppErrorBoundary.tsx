import React from 'react';
import type { AppErrorKind } from './appErrorRecovery';
import { classifyAppError, createIncidentId, registerAppIncident } from './appErrorRecovery';
import AppErrorRecoveryScreen from './AppErrorRecoveryScreen';
import './AppErrorBoundary.css';

type Failure = {
  kind: AppErrorKind;
  incidentId: string;
};

type AppErrorBoundaryProps = React.PropsWithChildren<{
  releaseId: string;
}>;

type AppErrorBoundaryState = {
  failure: Failure | null;
  retryRevision: number;
};

export default class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  declare readonly props: AppErrorBoundaryProps;
  declare setState: (
    updater: (previous: AppErrorBoundaryState) => AppErrorBoundaryState,
  ) => void;
  state: AppErrorBoundaryState = { failure: null, retryRevision: 0 };
  private recoveryRef = React.createRef<HTMLElement>();

  static getDerivedStateFromError(error: unknown): Pick<AppErrorBoundaryState, 'failure'> {
    return {
      failure: {
        kind: classifyAppError(error),
        incidentId: createIncidentId(),
      },
    };
  }

  componentDidCatch(): void {
    const { failure } = this.state;
    if (!failure) return;
    registerAppIncident(failure.incidentId);
    if (import.meta.env.VITE_SENTRY_DSN) {
      const error: unknown = arguments[0];
      void import('../telemetry/sentry').then(({ captureClientException }) => {
        captureClientException(error, {
          incidentId: failure.incidentId,
          incidentKind: failure.kind,
        });
      });
    }
    console.error('[app-error-boundary]', JSON.stringify({
      kind: failure.kind,
      incidentId: failure.incidentId,
      releaseId: this.props.releaseId,
    }));
    window.requestAnimationFrame(() => this.recoveryRef.current?.focus());
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
      return (
        <AppErrorRecoveryScreen
          {...failure}
          releaseId={this.props.releaseId}
          onRetry={this.handleRetry}
          focusRef={this.recoveryRef}
        />
      );
    }
    return <React.Fragment key={retryRevision}>{this.props.children}</React.Fragment>;
  }
}
