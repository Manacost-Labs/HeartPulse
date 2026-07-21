type ClearableCache = { clear: () => void };
type SingletonCache = { current: unknown };

export type ParserDataCacheInvalidationDependencies = {
  memoryCaches: ClearableCache[];
  singletonCaches: SingletonCache[];
  invalidateCards: () => void;
  invalidateDerived: () => void;
  clearRedis: () => Promise<void>;
};

export async function invalidateParserDataCaches(
  dependencies: ParserDataCacheInvalidationDependencies,
): Promise<void> {
  for (const cache of dependencies.memoryCaches) cache.clear();
  for (const cache of dependencies.singletonCaches) cache.current = null;
  dependencies.invalidateCards();
  dependencies.invalidateDerived();
  await dependencies.clearRedis();
}
