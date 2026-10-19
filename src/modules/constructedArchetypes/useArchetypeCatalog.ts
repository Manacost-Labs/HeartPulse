'use client';
import { useEffect, useRef } from 'react';
import { useDetailSection } from './useDetailSection';

type Format = 'standard' | 'wild';
const CATALOG_REUSE_MS = 30_000;
const ignoreDenied = () => undefined;

/** Every viewer sees the same anonymous summary; never wait for session/entitlement checks. */
export function useArchetypeCatalog<D extends { format: Format }>(format: Format, initial: D | null) {
  const cache = useRef(new Map<Format, { data: D; until: number }>());
  const seeded = useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    if (initial) cache.current.set(initial.format, { data: initial, until: Date.now() + CATALOG_REUSE_MS });
  }
  const entry = cache.current.get(format);
  const seed = entry && entry.until > Date.now() ? entry.data : null;
  const result = useDetailSection<D>(`/api/constructed-archetypes/teaser?format=${format}`, true, seed, ignoreDenied);
  useEffect(() => {
    if (result.data?.format === format && result.data !== entry?.data) {
      cache.current.set(format, { data: result.data, until: Date.now() + CATALOG_REUSE_MS });
    }
  }, [result.data, format, entry?.data]);
  return result;
}
