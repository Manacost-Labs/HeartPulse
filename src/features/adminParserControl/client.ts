import { normalizeParserControl, normalizeParserRuns } from './normalize';
import type { ParserControlSnapshot, ParserPublicationMode, ParserRun } from './types';

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(typeof payload.error === 'string' ? payload.error : 'Не удалось связаться с API данных');
    (error as Error & { code?: string; status?: number }).code = typeof payload.code === 'string' ? payload.code : undefined;
    (error as Error & { code?: string; status?: number }).status = response.status;
    throw error;
  }
  return payload;
}

export async function loadParserControl(signal?: AbortSignal): Promise<ParserControlSnapshot> {
  return normalizeParserControl(await request('/api/admin/parser-control', { signal }));
}

export async function updateParserPolicy(input: {
  mode: ParserPublicationMode;
  earlyUntil: string | null;
  reason: string;
  expectedRevision: number;
}): Promise<ParserControlSnapshot> {
  return normalizeParserControl(await request('/api/admin/parser-control/policy', {
    method: 'PATCH',
    body: JSON.stringify(input),
  }));
}

export async function updateParserSections(input: {
  sections: Record<string, boolean>;
  expectedRevision: number;
}): Promise<ParserControlSnapshot> {
  return normalizeParserControl(await request('/api/admin/parser-control/sections', {
    method: 'PATCH',
    body: JSON.stringify(input),
  }));
}

export async function createParserRun(input: {
  sectionIds: string[];
  sourceIds?: string[];
  reason: string;
}): Promise<ParserRun | null> {
  const payload = await request('/api/admin/parser-control/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return normalizeParserRuns({ runs: [root.run ?? payload] })[0] ?? null;
}

export async function loadParserRuns(signal?: AbortSignal): Promise<ParserRun[]> {
  return normalizeParserRuns(await request('/api/admin/parser-control/runs', { signal }));
}
