import { useEffect, useRef, useState } from 'react';

export type CatalogRequestState<P> = {
  requestUrl: string;
  payload: P | null;
  error: string | null;
};

/**
 * The catalog page for `request`. A server-rendered seed for the same request
 * answers the first one, so the grid is in the document and is not fetched
 * again after hydration; later filter and page changes load in the browser.
 * The address bar follows the request either way.
 */
export function useCatalogRequest<P extends { pagination: { page: number } }>(
  request: { query: string; url: string },
  page: number,
  correctPage: (page: number) => void,
  initialCatalog: { requestUrl: string; payload: P } | null | undefined,
  fetchCatalog: (url: string, signal: AbortSignal) => Promise<P>,
): CatalogRequestState<P> {
  const seed = initialCatalog?.requestUrl === request.url ? initialCatalog : null;
  const answeredUrl = useRef(seed?.requestUrl ?? '');
  const seededPage = useRef(seed?.payload.pagination.page ?? null);
  const [requestState, setRequestState] = useState<CatalogRequestState<P>>(() => seed
    ? { requestUrl: seed.requestUrl, payload: seed.payload, error: null }
    : { requestUrl: '', payload: null, error: null });
  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${request.query ? `?${request.query}` : ''}`,
    );
    if (request.url === answeredUrl.current) {
      // Express clamps an out-of-range page (?page=99): move the controls and
      // the address to the page it answered, exactly as a browser fetch does.
      if (seededPage.current !== null && seededPage.current !== page) correctPage(seededPage.current);
      return undefined;
    }
    answeredUrl.current = '';

    const controller = new AbortController();
    fetchCatalog(request.url, controller.signal)
      .then(result => {
        setRequestState({ requestUrl: request.url, payload: result, error: null });
        if (result.pagination.page !== page) correctPage(result.pagination.page);
      })
      .catch(requestError => {
        if (requestError?.name !== 'AbortError') {
          setRequestState({
            requestUrl: request.url,
            payload: null,
            error: requestError instanceof Error ? requestError.message : 'Не удалось загрузить каталог',
          });
        }
      });
    return () => controller.abort();
  }, [request.query, request.url, page, correctPage, fetchCatalog]);
  return requestState;
}
