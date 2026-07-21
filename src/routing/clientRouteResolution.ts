export type ClientRouteStatus = 'known' | 'not-found' | 'unavailable';

export type ClientRouteResolution = {
  pathname: string;
  status: ClientRouteStatus;
};

export type InitialServerRouteHint = Readonly<{
  pathname: string;
  status: 'not-found';
}> | null;

export function normalizeClientRoutePath(path: string): string {
  return path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
}

export function captureInitialServerRouteHint(path: string, serverStatus?: string): InitialServerRouteHint {
  return serverStatus === '404'
    ? { pathname: normalizeClientRoutePath(path), status: 'not-found' }
    : null;
}

export function initialClientRouteResolution(path: string, hint: InitialServerRouteHint = null): ClientRouteResolution {
  const pathname = normalizeClientRoutePath(path);
  return {
    pathname,
    status: hint?.status === 'not-found' && hint.pathname === pathname ? 'not-found' : 'known',
  };
}

export function withHistoryRouteKnowledge(state: unknown, known: boolean): Record<string, unknown> {
  const existing = state && typeof state === 'object' && !Array.isArray(state)
    ? state as Record<string, unknown>
    : {};
  return { ...existing, routeKnown: known };
}

export function historyRouteKnowledge(state: unknown): boolean | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const value = (state as Record<string, unknown>).routeKnown;
  return value === true || value === false ? value : null;
}

export function settledClientRouteResolution(path: string, known: boolean): ClientRouteResolution {
  return {
    pathname: normalizeClientRoutePath(path),
    status: known ? 'known' : 'not-found',
  };
}

export function reconcileClientRouteResolution(
  current: ClientRouteResolution,
  path: string,
  known: boolean,
): ClientRouteResolution {
  const next = settledClientRouteResolution(path, known);
  return current.pathname === next.pathname && current.status === next.status ? current : next;
}

export function unavailableClientRouteResolution(path: string): ClientRouteResolution {
  return { pathname: normalizeClientRoutePath(path), status: 'unavailable' };
}

export function clientRouteView(
  resolution: ClientRouteResolution,
  currentPath: string,
): ClientRouteStatus | 'pending' {
  return resolution.pathname === normalizeClientRoutePath(currentPath) ? resolution.status : 'pending';
}
