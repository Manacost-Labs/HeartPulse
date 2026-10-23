/**
 * Reads behind the admin panel sections that the panel itself owns (contests, referrals, Boosty,
 * Telegram). Each function throws a readable error; the panel caches answers per tab.
 */
import { fetchWithDeadline, type DeadlineRequestInit } from '../../shared/http/fetchWithDeadline';
import type { Contest } from '../ContestAdminContests';
import type { AdminReferralClick, AdminReferralLink } from '../ContestAdminReferrals';
import type { BoostyAdminStatus, BoostySubscribersPayload } from '../ContestAdminBoosty';
import type { TelegramAccountsPayload } from '../ContestAdminTelegram';

// The server waits up to 15 s (status) and 25 s (subscribers) for boosty-auth before it answers.
const BOOSTY_STATUS_DEADLINE_MS = 30_000;
const BOOSTY_SUBSCRIBERS_DEADLINE_MS = 45_000;

type Json = Record<string, unknown>;

const record = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {});
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

async function readJson(path: string, fallbackError: string, init: DeadlineRequestInit = {}): Promise<Json> {
  // The time parameter keeps any shared cache between the browser and the API from answering.
  const url = `${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`;
  const response = await fetchWithDeadline(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
  });
  const data = record(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(text(data.error) || fallbackError);
  return data;
}

export async function fetchAdminContests(): Promise<Contest[]> {
  const data = await readJson('/api/admin/contests', 'Не удалось загрузить конкурсы');
  return list<Contest>(data.contests);
}

export type AdminReferralsPayload = { referrals: AdminReferralLink[]; recentClicks: AdminReferralClick[] };

export async function fetchReferrals(): Promise<AdminReferralsPayload> {
  const data = await readJson('/api/admin/referrals', 'Не удалось загрузить реферальные ссылки');
  return {
    referrals: list<AdminReferralLink>(data.referrals),
    recentClicks: list<AdminReferralClick>(data.recentClicks),
  };
}

/** `fresh` skips the server's one-minute Boosty cache (the section's «Обновить»). */
export async function fetchBoostyStatus(fresh = false): Promise<BoostyAdminStatus> {
  return await readJson(`/api/admin/boosty/status${fresh ? '?fresh=1' : ''}`, 'Не удалось загрузить статус Boosty', {
    deadlineMs: BOOSTY_STATUS_DEADLINE_MS,
  }) as unknown as BoostyAdminStatus;
}

/** What the Boosty section shows when the status request itself failed. */
export function boostyStatusFailure(error: Error): BoostyAdminStatus {
  return {
    configured: true,
    ok: false,
    importStatus: 'error',
    source: 'admin-panel',
    stale: true,
    snapshotAgeSeconds: null,
    lastErrorCategory: 'admin-request-failed',
    lastErrorMessage: error.message || 'Не удалось загрузить статус Boosty',
    warnings: ['admin-request-failed'],
    summary: {},
    checkedAt: new Date().toISOString(),
    graceHours: 24,
  };
}

export async function fetchBoostySubscribers(fresh = false): Promise<BoostySubscribersPayload> {
  const path = `/api/admin/boosty/subscribers?includeInactive=1${fresh ? '&fresh=1' : ''}`;
  const data = await readJson(path, 'Не удалось загрузить подписчиков Boosty', {
    deadlineMs: BOOSTY_SUBSCRIBERS_DEADLINE_MS,
  });
  return {
    configured: Boolean(data.configured),
    source: text(data.source),
    stale: Boolean(data.stale),
    summary: record(data.summary) as BoostySubscribersPayload['summary'],
    levels: record(data.levels) as BoostySubscribersPayload['levels'],
    subscribers: list<BoostySubscribersPayload['subscribers'][number]>(data.subscribers),
    fetchedAt: text(data.fetchedAt) || new Date().toISOString(),
    error: text(data.error) || undefined,
  };
}

export function boostySubscribersFailure(error: Error): BoostySubscribersPayload {
  return {
    configured: true,
    source: 'admin-panel',
    stale: true,
    summary: {},
    levels: {},
    subscribers: [],
    fetchedAt: new Date().toISOString(),
    error: error.message || 'Не удалось загрузить подписчиков Boosty',
  };
}

const EMPTY_TELEGRAM_SUMMARY = { total: 0, access: 0, checkable: 0, contactOnly: 0, stale: 0, blocked: 0 };

export async function fetchTelegramAccounts(): Promise<TelegramAccountsPayload> {
  const data = await readJson('/api/admin/telegram/accounts', 'Не удалось загрузить Telegram-аккаунты');
  const summary = data.summary && typeof data.summary === 'object' ? record(data.summary) : null;
  return {
    configured: Boolean(data.configured),
    chatIds: list<unknown>(data.chatIds).map(String),
    summary: summary
      ? {
        total: Number(summary.total || 0),
        access: Number(summary.access || 0),
        checkable: Number(summary.checkable || 0),
        contactOnly: Number(summary.contactOnly || 0),
        stale: Number(summary.stale || 0),
        blocked: Number(summary.blocked || 0),
      }
      : EMPTY_TELEGRAM_SUMMARY,
    accounts: list<TelegramAccountsPayload['accounts'][number]>(data.accounts),
    fetchedAt: text(data.fetchedAt) || new Date().toISOString(),
    error: text(data.error) || undefined,
  };
}

export function telegramAccountsFailure(error: Error): TelegramAccountsPayload {
  return {
    configured: true,
    chatIds: [],
    summary: EMPTY_TELEGRAM_SUMMARY,
    accounts: [],
    fetchedAt: new Date().toISOString(),
    error: error.message || 'Не удалось загрузить Telegram-аккаунты',
  };
}

export type AdminRead<T> = { key: string; load: () => Promise<T> };

/** Cache keys and loaders of the panel-owned reads; the panel and the early preload share them. */
export const ADMIN_READS = {
  contests: { key: '/api/admin/contests', load: fetchAdminContests },
  referrals: { key: '/api/admin/referrals', load: fetchReferrals },
  boostyStatus: { key: '/api/admin/boosty/status', load: () => fetchBoostyStatus() },
  boostySubscribers: { key: '/api/admin/boosty/subscribers', load: () => fetchBoostySubscribers() },
  telegram: { key: '/api/admin/telegram/accounts', load: fetchTelegramAccounts },
} satisfies Record<string, AdminRead<unknown>>;
