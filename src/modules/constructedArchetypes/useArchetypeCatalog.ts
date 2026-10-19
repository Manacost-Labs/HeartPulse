'use client';
import { useEffect, useState } from 'react';
import { useDetailSection } from './useDetailSection';

type Format = 'standard' | 'wild';
const CATALOG_REUSE_MS = 30_000;
const ignoreDenied = () => undefined;

/** Every viewer sees the same anonymous summary; never wait for session/entitlement checks. */
export function useArchetypeCatalog<D extends { format: Format }>(format: Format, initial: D | null) {
  const [cache, setCache] = useState<Partial<Record<Format, { data: D; until: number }>>>(() => initial
    ? { [initial.format]: { data: initial, until: Date.now() + CATALOG_REUSE_MS } } : {});
  const entry = cache[format];
  const seed = entry && entry.until > Date.now() ? entry.data : null;
  const result = useDetailSection<D>(`/api/constructed-archetypes/teaser?format=${format}`, true, seed, ignoreDenied);
  useEffect(() => {
    const data = result.data;
    if (data?.format === format && data !== entry?.data) {
      setCache(previous => ({ ...previous, [format]: { data, until: Date.now() + CATALOG_REUSE_MS } }));
    }
  }, [result.data, format, entry?.data]);
  return result;
}
