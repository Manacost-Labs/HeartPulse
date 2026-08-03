export type AppErrorKind = 'render' | 'chunk';

export type AppIncidentDetails = {
  kind: AppErrorKind;
  releaseId: string;
  error?: unknown;
  componentStack?: string;
  scope?: string;
};

const RELEASE_SHA_PATTERN = /^[a-f0-9]{7,40}$/i;
const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk\b.*\bfailed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS for \/assets\//i,
];

export function releaseIdFromModuleUrl(moduleUrl: string): string {
  try {
    const value = new URL(moduleUrl).searchParams.get('v')?.trim() ?? '';
    return RELEASE_SHA_PATTERN.test(value) ? value.toLowerCase() : 'development';
  } catch {
    return 'development';
  }
}

export function createIncidentId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function classifyAppError(error: unknown): AppErrorKind {
  const description = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error ?? '');
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(description)) ? 'chunk' : 'render';
}

function errorDetails(error: unknown): { errorName: string; message: string; stack: string } {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      message: error.message,
      stack: error.stack ?? '',
    };
  }
  return { errorName: typeof error, message: String(error ?? ''), stack: '' };
}

export function registerAppIncident(incidentId: string, details: AppIncidentDetails): void {
  if (typeof globalThis.fetch !== 'function') return;
  const error = errorDetails(details.error);
  const route = typeof window !== 'undefined' ? window.location.pathname : '/';
  void globalThis.fetch('/api/telemetry/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    keepalive: true,
    body: JSON.stringify({
      incidentId,
      kind: details.kind,
      releaseId: details.releaseId,
      route,
      scope: details.scope ?? '',
      ...error,
      componentStack: details.componentStack ?? '',
    }),
  }).catch(() => {});
}
