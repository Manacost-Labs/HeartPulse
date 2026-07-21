import type {
  AdminParserControlClient,
  ParserPolicyUpdate,
  ParserRunRequest,
  ParserSectionUpdate,
} from './adminParserControlRoutes.js';

type FetchLike = typeof fetch;

export class HsDataApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HsDataApiError';
    this.status = status;
  }
}

function trimOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function cleanBody(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload;
  const body = { ...(payload as Record<string, unknown>) };
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }
  return body;
}

function errorDetail(payload: Record<string, unknown>, status: number): { code?: string; message: string } {
  const detail = payload.detail;
  if (typeof detail === 'string') return { message: detail };
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const record = detail as Record<string, unknown>;
    return {
      code: typeof record.code === 'string' ? record.code : undefined,
      message: typeof record.message === 'string'
        ? record.message
        : `API данных ответил с кодом ${status}`,
    };
  }
  return {
    code: typeof payload.code === 'string' ? payload.code : undefined,
    message: typeof payload.error === 'string'
      ? payload.error
      : `API данных ответил с кодом ${status}`,
  };
}

export function createHsDataParserControlClient(options: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): AdminParserControlClient {
  const baseUrl = trimOrigin(options.baseUrl);
  const apiKey = options.apiKey.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 15_000);

  const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    if (!baseUrl || !apiKey) throw new HsDataApiError(503, 'Управление парсерами ещё не подключено к API данных');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'X-API-Key': apiKey,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        const detail = errorDetail(payload, response.status);
        const error = new HsDataApiError(response.status, detail.message);
        if (detail.code) Object.assign(error, { code: detail.code });
        throw error;
      }
      return payload;
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') {
        throw new HsDataApiError(504, 'API данных не ответил вовремя');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    configured: Boolean(baseUrl && apiKey),
    getControl: () => request('/admin/parser-control'),
    updatePolicy: (payload: ParserPolicyUpdate) => request('/admin/parser-control/policy', {
      method: 'PATCH',
      body: JSON.stringify(cleanBody(payload)),
    }),
    updateSections: (payload: ParserSectionUpdate) => request('/admin/parser-control/sections', {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: payload.expectedRevision,
        sections: Object.entries(payload.sections).map(([id, enabled]) => ({ id, enabled })),
        updatedBy: payload.updatedBy,
      }),
    }),
    createRun: (payload: ParserRunRequest) => request('/admin/parser-runs', {
      method: 'POST',
      body: JSON.stringify(cleanBody(payload)),
    }),
    listRuns: () => request('/admin/parser-runs?limit=20'),
  };
}
