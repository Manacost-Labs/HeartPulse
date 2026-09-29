import { useCallback, useEffect, useRef, useState } from 'react';
import {
  adminCrmClient,
  type AdminCrmSegmentId,
  type AdminCrmSegments,
} from '../modules/adminCrm/public';
import type { AdminUserSearchResult } from './ContestAdminUserRow';

export const ADMIN_USERS_PAGE_SIZE = 20;

/** State and loading for the admin people list: search, CRM segment/tag filters, paging and segment counts. */
export function useAdminUsersList(enabled: boolean, onError: (text: string) => void) {
  const [query, setQueryState] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUserSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [segment, setSegment] = useState<AdminCrmSegmentId>('all');
  const [tag, setTag] = useState('');
  const [segments, setSegments] = useState<AdminCrmSegments | null>(null);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));
  // A message sink whose identity changes every render; reading it through a ref keeps it out of the fetch deps.
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!enabled) {
      setUsers([]);
      setTotal(0);
      return;
    }
    const controller = new AbortController();
    const trimmed = query.trim();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: String(ADMIN_USERS_PAGE_SIZE), offset: String((page - 1) * ADMIN_USERS_PAGE_SIZE) });
      if (trimmed) params.set('q', trimmed);
      if (segment !== 'all') params.set('segment', segment);
      if (tag) params.set('tag', tag);
      setLoading(true);
      adminCrmClient.users<AdminUserSearchResult>(params, controller.signal)
        .then(result => {
          setUsers(result.users);
          setTotal(result.total);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setUsers([]);
          setTotal(0);
          onErrorRef.current(error instanceof Error ? error.message : 'Не удалось загрузить пользователей');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, trimmed ? 220 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, query, segment, tag, page, reloadKey]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    // Counts are a navigation aid; the list stays usable with the plain "Все" chip if they fail.
    adminCrmClient.segments(controller.signal)
      .then(setSegments)
      .catch(() => { if (!controller.signal.aborted) setSegments(null); });
    return () => controller.abort();
  }, [enabled, reloadKey]);

  useEffect(() => {
    setPage(current => Math.min(current, pageCount));
  }, [pageCount]);

  const reload = useCallback(() => setReloadKey(value => value + 1), []);
  const setQuery = useCallback((next: string) => { setQueryState(next); setPage(1); }, []);
  const changeSegment = useCallback((next: { segment: AdminCrmSegmentId; tag: string }) => {
    setSegment(next.segment);
    setTag(next.tag);
    setPage(1);
  }, []);

  return { query, setQuery, page, setPage, pageCount, users, total, loading, reload, segments, segment, tag, changeSegment };
}
