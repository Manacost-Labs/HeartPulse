import { useCallback, useEffect, useRef, useState } from 'react';
import {
  adminCrmClient,
  type AdminCrmSegmentId,
} from '../modules/adminCrm/public';
import { invalidateAdminResources, prefetchAdminResource, useAdminResource } from '../modules/adminWorkspace/public';
import type { AdminUserSearchResult } from './ContestAdminUserRow';

export const ADMIN_USERS_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 220;
const USERS_KEY = '/api/admin/users';
const SEGMENTS_KEY = '/api/admin/crm/segments';

function usersPageSearch(page: number, query: string, segment: AdminCrmSegmentId, tag: string): string {
  const params = new URLSearchParams({ limit: String(ADMIN_USERS_PAGE_SIZE), offset: String((page - 1) * ADMIN_USERS_PAGE_SIZE) });
  if (query) params.set('q', query);
  if (segment !== 'all') params.set('segment', segment);
  if (tag) params.set('tag', tag);
  return params.toString();
}

const loadUsersPage = (search: string) => adminCrmClient.users<AdminUserSearchResult>(new URLSearchParams(search));
const loadSegments = () => adminCrmClient.segments();

/** Starts the unfiltered first page and the segment counts before the people section mounts. */
export function preloadAdminUsers(): void {
  const search = usersPageSearch(1, '', 'all', '');
  prefetchAdminResource(`${USERS_KEY}?${search}`, () => loadUsersPage(search));
  prefetchAdminResource(SEGMENTS_KEY, loadSegments);
}

/** The search text after typing pauses, so each keystroke does not become a request. */
function useSettledQuery(query: string) {
  const [settled, setSettled] = useState(query);
  useEffect(() => {
    if (query === settled) return undefined;
    const timer = window.setTimeout(() => setSettled(query), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [query, settled]);
  return settled;
}

/**
 * State and loading for the admin people list: search, CRM segment/tag filters, paging and segment
 * counts. Pages are cached per tab: going back to a page or filter shows it at once, and while a
 * new page loads the previous rows stay on screen instead of an empty table.
 */
export function useAdminUsersList(enabled: boolean, onError: (text: string) => void) {
  const [query, setQueryState] = useState('');
  const [page, setPage] = useState(1);
  const [segment, setSegment] = useState<AdminCrmSegmentId>('all');
  const [tag, setTag] = useState('');
  const settledQuery = useSettledQuery(query.trim());

  const search = usersPageSearch(page, settledQuery, segment, tag);
  const usersKey = enabled ? `${USERS_KEY}?${search}` : null;
  const loadUsers = useCallback(() => loadUsersPage(search), [search]);
  const usersResource = useAdminResource(usersKey, loadUsers, { keepPrevious: true });
  // Counts are a navigation aid; the list stays usable with the plain «Все» chip if they fail.
  const segmentsResource = useAdminResource(enabled ? SEGMENTS_KEY : null, loadSegments);

  // A message sink whose identity changes every render; reading it through a ref keeps it out of the effect deps.
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => {
    if (usersResource.error) onErrorRef.current(usersResource.error.message || 'Не удалось загрузить пользователей');
  }, [usersResource.error]);

  const total = usersResource.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));
  useEffect(() => {
    if (usersResource.data) setPage(current => Math.min(current, pageCount));
  }, [pageCount, usersResource.data]);

  const reload = useCallback(() => {
    invalidateAdminResources(USERS_KEY);
    invalidateAdminResources(SEGMENTS_KEY);
  }, []);
  const setQuery = useCallback((next: string) => { setQueryState(next); setPage(1); }, []);
  const changeSegment = useCallback((next: { segment: AdminCrmSegmentId; tag: string }) => {
    setSegment(next.segment);
    setTag(next.tag);
    setPage(1);
  }, []);

  return {
    query,
    setQuery,
    page,
    setPage,
    pageCount,
    users: usersResource.data?.users ?? [],
    total,
    loading: usersResource.loading || usersResource.refreshing || query.trim() !== settledQuery,
    reload,
    segments: segmentsResource.data ?? null,
    segment,
    tag,
    changeSegment,
  };
}
