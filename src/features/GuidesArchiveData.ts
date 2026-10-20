import { useCallback, useEffect, useState } from 'react';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { GUIDES_ARCHIVE_PAGE_SIZE } from './GuidesArchiveSkeleton';

interface GuideFilter {
  slug: string;
  label: string;
  count: number;
}

export interface GuideArchiveItem {
  id: number;
  slug: string;
  title: string;
  description: string;
  image: string | null;
  publishedAt: string | null;
  menuName: string | null;
  menuCode: string | null;
  kind: string | null;
  kindSlug: string | null;
  oldUrl: string | null;
}

interface GuidesArchiveResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  items: GuideArchiveItem[];
  filters: {
    kinds: GuideFilter[];
    menus: GuideFilter[];
  };
}

interface GuideDetail extends GuideArchiveItem {
  keywords: string | null;
  replyCount: number;
  contentHtml: string;
  fallbackText: string;
  sourceUrl: string | null;
}

/** What the server already rendered for a guide (the public teaser): enough for its header. */
export type GuideDetailSeed = Pick<GuideArchiveItem, 'title' | 'description' | 'image' | 'publishedAt' | 'kind' | 'menuName'>;

const PAGE_SIZE = GUIDES_ARCHIVE_PAGE_SIZE;

/**
 * One page of the archive. The previous page stays on screen (dimmed, aria-busy)
 * while the next one loads; only the first load has nothing to show. A stalled
 * request ends at the request deadline with a retry instead of loading forever.
 */
export function useGuidesArchivePage(page: number, submittedQuery: string, kind: string) {
  const [data, setData] = useState<GuidesArchiveResponse | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    setError('');
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (submittedQuery.trim()) params.set('q', submittedQuery.trim());
    if (kind) params.set('kind', kind);
    fetchWithDeadline(`/api/guides-archive?${params.toString()}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить архив');
        return await response.json() as GuidesArchiveResponse;
      })
      .then(payload => {
        if (controller.signal.aborted) return;
        setData(payload);
        setPending(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error && cause.message ? cause.message : 'Не удалось загрузить архив гайдов');
        setPending(false);
      });
    return () => controller.abort();
  }, [kind, page, submittedQuery, attempt]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { data, pending, error, retry };
}

type GuideDetailRequest = { slug: string; guide: GuideDetail | null; error: string; missing: boolean };

export function useGuideDetail(slug: string) {
  const [request, setRequest] = useState<GuideDetailRequest>({ slug: '', guide: null, error: '', missing: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchWithDeadline(`/api/guides-archive/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(async response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Не удалось загрузить гайд');
        return await response.json() as GuideDetail;
      })
      .then(guide => {
        if (!controller.signal.aborted) setRequest({ slug, guide, error: guide ? '' : 'Гайд не найден', missing: !guide });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const error = cause instanceof Error && cause.message ? cause.message : 'Не удалось загрузить гайд';
        setRequest({ slug, guide: null, error, missing: false });
      });
    return () => controller.abort();
  }, [slug, attempt]);

  const current = request.slug === slug ? request : null;
  const retry = useCallback(() => {
    setRequest({ slug: '', guide: null, error: '', missing: false });
    setAttempt(value => value + 1);
  }, []);
  return { guide: current?.guide ?? null, error: current?.error ?? '', missing: current?.missing ?? false, retry };
}
