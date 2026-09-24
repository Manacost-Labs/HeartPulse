import type { Contest } from '../model/types';

function responseError(value: unknown, fallback: string): string {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') {
    return value.error;
  }
  return fallback;
}

export async function requestContests(): Promise<Contest[]> {
  const response = await fetch('/api/contests', {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responseError(data, 'Не удалось загрузить конкурсы'));
  if (!data || typeof data !== 'object' || !('contests' in data) || !Array.isArray(data.contests)) return [];
  return data.contests as Contest[];
}

export async function requestContestJoin(contestId: string): Promise<void> {
  const response = await fetch(`/api/contests/${encodeURIComponent(contestId)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responseError(data, 'Не удалось подать заявку'));
}
