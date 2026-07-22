export type StandardMetaRecommendationCacheEntry<T> = {
  data: T;
  expiresAt: number;
};

export function cacheSuccessfulRecommendation<T>(
  cache: Map<string, StandardMetaRecommendationCacheEntry<T>>,
  key: string,
  recommendation: T | null,
  expiresAt: number,
): boolean {
  if (recommendation === null) {
    cache.delete(key);
    return false;
  }
  cache.set(key, { data: recommendation, expiresAt });
  return true;
}
