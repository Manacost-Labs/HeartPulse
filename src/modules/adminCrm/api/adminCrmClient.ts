/** Browser client for the admin CRM API. Contract: docs/specs/admin-crm.md. */
import type { AdminCrmOverview } from './adminCrmContracts';
export type AdminCrmSegmentId = 'all' | 'paying' | 'manual' | 'expiring' | 'lapsed' | 'new' | 'blocked' | 'admins';

export type AdminCrmSegment = { id: AdminCrmSegmentId; label: string; count: number };
export type AdminCrmTagCount = { tag: string; count: number };
export type AdminCrmSegments = { segments: AdminCrmSegment[]; tags: AdminCrmTagCount[] };

export type AdminCrmNote = { id: number; body: string; authorId: string; authorName: string; createdAt: string };

export type AdminCrmPerson = {
  person: {
    id: string; name: string; email: string; role: string; country: string;
    createdAt: string; updatedAt: string; blockedAt: string | null; newsletterOptIn: boolean;
    contacts: { telegram: string; vk: string; email: string };
  };
  identities: Array<{ provider: string; username: string; createdAt: string; verifiedAt: string | null }>;
  access: {
    hasAccess: boolean; source: string; message: string; checkedAt: string;
    manual: null | {
      active: boolean; grantedBy: string; grantedAt: string; expiresAt: string | null;
      revokedBy: string | null; revokedAt: string | null; note: string;
    };
  };
  accessHistory: Array<{ at: string; source: string; hasAccess: boolean }>;
  /** The campaign link that brought this person, when the account was created after a click. */
  referral: null | { label: string; slug: string; campaign: string; clickedAt: string };
  contests: Array<{ contestId: string; title: string; status: string; createdAt: string }>;
  mailing: null | {
    consentStatus: string; consentedAt: string | null; unsubscribedAt: string | null;
    delivered: number; failed: number; lastDeliveredAt: string | null;
  };
  notes: AdminCrmNote[];
  tags: string[];
  /** Paid articles this person opened in the last 30 days, and when they last opened any. */
  reading?: { opens: number; articles: number; lastOpenedAt: string | null };
  audit: Array<{ id: number; action: string; actorId: string; actorName: string; details: Record<string, unknown>; createdAt: string }>;
};

const JSON_HEADERS: HeadersInit = { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' };

// The single same-origin transport for admin people data (CSRF header, no caching, readable errors).
async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: JSON_HEADERS,
    signal,
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(failure.error || `Ошибка ${response.status}`);
  }
  return await response.json() as T;
}

const personPath = (userId: string) => `/crm/people/${encodeURIComponent(userId)}`;

export type AdminUsersPage<TUser> = { users: TUser[]; total: number };

export const adminCrmClient = {
  /** GET /api/admin/users with search, segment, tag and paging parameters. */
  users: <TUser>(params: URLSearchParams, signal?: AbortSignal) => request<Partial<AdminUsersPage<TUser>>>(`/users?${params.toString()}`, {}, signal)
    .then(page => ({ users: Array.isArray(page.users) ? page.users : [], total: Number(page.total || 0) })),
  segments: (signal?: AbortSignal) => request<AdminCrmSegments>('/crm/segments', {}, signal),
  /** Alerts, KPIs and activity; `fresh` skips the server's one-minute cache. */
  overview: (fresh: boolean, signal?: AbortSignal) => request<AdminCrmOverview>(`/crm/overview${fresh ? '?fresh=1' : ''}`, {}, signal),
  person: (userId: string, signal?: AbortSignal) => request<AdminCrmPerson>(personPath(userId), {}, signal),
  addNote: (userId: string, body: string) => request<{ note: AdminCrmNote }>(`${personPath(userId)}/notes`, {
    method: 'POST', body: JSON.stringify({ body }),
  }).then(result => result.note),
  deleteNote: (userId: string, noteId: number) => request<{ ok: true }>(`${personPath(userId)}/notes/${noteId}`, { method: 'DELETE' }),
  setTags: (userId: string, tags: string[]) => request<{ tags: string[] }>(`${personPath(userId)}/tags`, {
    method: 'PUT', body: JSON.stringify({ tags }),
  }).then(result => result.tags),
};

export type AdminCrmClient = typeof adminCrmClient;
