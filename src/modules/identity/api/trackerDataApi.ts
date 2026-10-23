import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import { authErrorFromPayload } from '../model/authUser';

export type TrackerDataSummary = { events: number; firstOccurredAt: string | null; lastOccurredAt: string | null };

/** The address of the full export; the browser downloads it as a file. */
export const TRACKER_DATA_EXPORT_URL = '/api/account/tracker-data/export';

const isIsoOrNull = (value: unknown) => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));

/** What the desktop tracker stored for this account; null when the answer is unavailable. */
export async function fetchTrackerDataSummary(signal?: AbortSignal): Promise<TrackerDataSummary | null> {
  try {
    const response = await fetchWithDeadline('/api/account/tracker-data', { signal, deadlineMs: 10_000 });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || !Number.isSafeInteger(payload.events) || !isIsoOrNull(payload.firstOccurredAt) || !isIsoOrNull(payload.lastOccurredAt)) {
      return null;
    }
    return payload as TrackerDataSummary;
  } catch {
    return null;
  }
}

/** Deletes every stored tracker event of the account; resolves with how many were deleted. */
export async function deleteTrackerData(): Promise<number> {
  const response = await fetchWithDeadline('/api/account/tracker-data', {
    method: 'DELETE', headers: { 'X-CSRF-Request': '1' }, deadlineMs: 20_000,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(authErrorFromPayload(payload) || 'Не удалось удалить данные приложения');
  const deleted = (payload as { deleted?: unknown }).deleted;
  return typeof deleted === 'number' ? deleted : 0;
}
