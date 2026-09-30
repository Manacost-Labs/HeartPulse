'use client';
import { useEffect, useRef } from 'react';
import { classifyAppError, createIncidentId } from '@/src/components/appErrorRecovery';
import { registerAppIncident } from '@/src/telemetry/clientIncident';

/**
 * Send the error caught by a route `error.tsx` to the first-party diagnostics
 * endpoint. `scope` names the boundary. A server render error reaches the
 * browser without its message, so its `digest` is added to the scope: the same
 * digest is printed next to the full error in the Next.js server log.
 *
 * The reporter is imported statically on purpose: after a deploy a stale tab
 * cannot load new chunks, and that is one of the failures it has to report.
 */
export function useRouteErrorReport(error: Error & { digest?: string }, scope: string): void {
  // React replays effects in development; one caught error is one report.
  const reported = useRef<unknown>(undefined);
  useEffect(() => {
    if (reported.current === error) return;
    reported.current = error;
    // A component may throw a value that is not an Error.
    const digest = typeof error === 'object' && error !== null ? error.digest : undefined;
    registerAppIncident(createIncidentId(), {
      kind: classifyAppError(error),
      releaseId: typeof __APP_RELEASE_SHA__ === 'string' ? __APP_RELEASE_SHA__ : 'development',
      error,
      scope: digest ? `${scope} digest=${digest}` : scope,
    });
  }, [error, scope]);
}
