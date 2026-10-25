'use client';
import { useDetailSection } from './useDetailSection';

const IGNORE_DENIAL = () => undefined;

/**
 * HSGuru stats of one archetype slice (`query` is the slice's search string;
 * empty asks for the best collected slice). Subscriber data: mount only with
 * full access. A denial surfaces as this section's error; the page's own
 * sections own the access state.
 */
export function useArchetypeHsguruStats<T>(format: 'standard' | 'wild', slug: string, query: string, enabled: boolean) {
  const url = `/api/constructed-archetype-stats/${format}/${slug}${query ? `?${query}` : ''}`;
  return useDetailSection<T>(url, enabled, null, IGNORE_DENIAL);
}
