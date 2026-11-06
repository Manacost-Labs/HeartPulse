import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import { authErrorFromPayload } from '../model/authUser';

/** A replay the account uploaded from the Hearthpulse app (plan 2.2). */
export type AccountReplay = { id: string; kind: 'constructed' | 'battlegrounds'; createdAt: string; mode: string; result: string; placement: number };

/** The account's replays, newest first; null when the answer is unavailable. */
export async function fetchAccountReplays(signal?: AbortSignal): Promise<AccountReplay[] | null> {
  try {
    const response = await fetchWithDeadline('/api/account/replays', { signal, deadlineMs: 10_000 });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as { replays?: unknown } | null;
    if (!payload || !Array.isArray(payload.replays)) return null;
    return payload.replays.flatMap(row => {
      const fields = row as Record<string, unknown>;
      const summary = (fields.summary ?? {}) as Record<string, unknown>;
      return typeof fields.id === 'string' && /^[0-9A-Za-z]{10}$/.test(fields.id) && (fields.kind === 'constructed' || fields.kind === 'battlegrounds')
        && typeof fields.createdAt === 'string'
        ? [{ id: fields.id, kind: fields.kind, createdAt: fields.createdAt, mode: typeof summary.mode === 'string' ? summary.mode : '',
          result: typeof summary.result === 'string' ? summary.result : '', placement: typeof summary.placement === 'number' ? summary.placement : 0 }]
        : [];
    });
  } catch {
    return null;
  }
}

export async function deleteAccountReplay(id: string): Promise<void> {
  const response = await fetchWithDeadline(`/api/account/replays/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { 'X-CSRF-Request': '1' }, deadlineMs: 10_000,
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    throw new Error(authErrorFromPayload(payload) || 'Не удалось удалить реплей');
  }
}
