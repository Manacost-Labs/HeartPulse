export type ClientRouteStatus = 'known' | 'not-found' | 'unavailable';

export type ClientRouteResolution = {
  pathname: string;
  status: ClientRouteStatus;
};

export type InitialServerRouteHint = string | null;

export function normalizeClientRoutePath(path: string): string {
  return path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
}

export function initialClientRouteResolution(path: string, hint: InitialServerRouteHint = null): ClientRouteResolution {
  const pathname = normalizeClientRoutePath(path);
  return {
    pathname,
    status: hint === pathname ? 'not-found' : 'known',
  };
}

export function withHistoryRouteKnowledge(state: unknown, known: boolean): Record<string, unknown> {
  const existing = state && typeof state === 'object'
    ? state as Record<string, unknown>
    : {};
  return { ...existing, routeKnown: known };
}

export function historyRouteKnowledge(state: unknown): boolean | null {
  const value = (state as { routeKnown?: unknown } | null)?.routeKnown;
  return typeof value === 'boolean' ? value : null;
}

export function settledClientRouteResolution(path: string, known: boolean): ClientRouteResolution {
  return {
    pathname: normalizeClientRoutePath(path),
    status: known ? 'known' : 'not-found',
  };
}

export function clientRouteView(
  resolution: ClientRouteResolution,
  currentPath: string,
): ClientRouteStatus | 'pending' {
  return resolution.pathname === normalizeClientRoutePath(currentPath) ? resolution.status : 'pending';
}
