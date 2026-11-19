/**
 * The format of a Standard page (Standard or Wild) lives in the address: `?format=wild`, and
 * nothing for Standard. Every page that offers the switch reads and writes it here, and the
 * menu follows it through the same address, so the page's buttons and the menu's mode are one
 * state. The Wild catalog of cards and the pages of one archetype carry the format in the
 * path instead (`/standard/cards/wild/`, `/standard/archetypes/wild/<slug>`).
 */
import { useLocationSearch } from './locationSearch';

export type PageFormat = 'standard' | 'wild';

export function readPageFormat(search: string): PageFormat {
  return new URLSearchParams(search).get('format') === 'wild' ? 'wild' : 'standard';
}

/** The query with the format set (Standard is the default and leaves no parameter); other parameters stay. */
export function searchWithFormat(search: string, format: PageFormat): string {
  const params = new URLSearchParams(search);
  if (format === 'wild') params.set('format', 'wild');
  else params.delete('format');
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Writes the format into the address of the page that is open. A format the address already
 * has changes nothing. `push` adds a history entry, so Back returns to the previous format.
 */
export function setPageFormat(format: PageFormat, how: 'push' | 'replace' = 'push'): void {
  const next = searchWithFormat(window.location.search, format);
  if (next === window.location.search) return;
  window.history[how === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', `${window.location.pathname}${next}${window.location.hash}`);
}

/** The format of the address; null on the server and while hydrating, where only the default is known. */
export function usePageFormat(): PageFormat | null {
  const search = useLocationSearch();
  return search === null ? null : readPageFormat(search);
}
