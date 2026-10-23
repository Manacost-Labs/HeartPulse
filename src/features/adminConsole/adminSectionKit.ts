/** Small helpers the admin sections share: request headers, readable errors and Russian dates. */
import type { AdminMessage } from '../adminWorkspaceState';

export type AdminMessageSink = (message: AdminMessage | null) => void;

export function authJsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' };
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The answer body of a failed or successful admin request, read leniently. */
export async function readResponseJson(response: Response): Promise<Record<string, unknown>> {
  const data: unknown = await response.json().catch(() => ({}));
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
