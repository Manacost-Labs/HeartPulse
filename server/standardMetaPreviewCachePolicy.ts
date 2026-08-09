export type StandardMetaPreviewCacheAction = 'evict' | 'refresh' | 'reuse';

export function standardMetaPreviewCacheAction(
  cacheIsValid: boolean,
  refreshRequested: boolean,
): StandardMetaPreviewCacheAction {
  if (!cacheIsValid) return 'evict';
  return refreshRequested ? 'refresh' : 'reuse';
}
