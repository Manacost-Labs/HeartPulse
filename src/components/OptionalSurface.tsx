import React from 'react';
import { classifyAppError, createIncidentId } from './appErrorRecovery';
import { registerAppIncident } from '../telemetry/clientIncident';

type OptionalSurfaceProps = React.PropsWithChildren<{ scope: string }>;

/**
 * Renders nothing when its child fails, and reports the failure. It is for a
 * part of the page that a visitor can do without, such as a prompt whose code
 * is loaded separately: a chunk that cannot load must not replace the page
 * with an error screen. It catches every error of its children, so they must
 * not call `notFound()` or `redirect()`, which work by throwing.
 */
export class OptionalSurface extends React.Component<OptionalSurfaceProps, { failed: boolean }> {
  declare readonly props: OptionalSurfaceProps;
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    registerAppIncident(createIncidentId(), {
      kind: classifyAppError(error),
      releaseId: typeof __APP_RELEASE_SHA__ === 'string' ? __APP_RELEASE_SHA__ : 'development',
      error,
      componentStack: info.componentStack ?? '',
      scope: this.props.scope,
    });
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
