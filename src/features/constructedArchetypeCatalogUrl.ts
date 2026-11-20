export type ArchetypeFormat = 'standard' | 'wild';
export type ArchetypeClass =
  | 'deathknight'
  | 'demonhunter'
  | 'druid'
  | 'hunter'
  | 'mage'
  | 'paladin'
  | 'priest'
  | 'rogue'
  | 'shaman'
  | 'warlock'
  | 'warrior';
export type ArchetypeClassFilter = 'all' | ArchetypeClass;

/**
 * Keeps catalog selection in the address bar without triggering navigation. The Wild catalog's
 * own page (`wildPath`) names its format in the path, so only the class stays in the query.
 */
export function replaceCatalogUrl(nextFormat: ArchetypeFormat, nextClass: ArchetypeClassFilter, wildPath = false): void {
  const params = new URLSearchParams(wildPath ? undefined : { format: nextFormat });
  if (nextClass !== 'all') params.set('class', nextClass);
  const query = params.toString();
  const path = wildPath ? '/standard/archetypes/wild/' : '/standard/archetypes';
  window.history.replaceState(window.history.state, '', query ? `${path}?${query}` : path);
}

export function readInitialCatalogFilters(
  search: string,
  classFilters: readonly { id: ArchetypeClassFilter }[],
): { format: ArchetypeFormat; classFilter: ArchetypeClassFilter } {
  const params = new URLSearchParams(search);
  const classParam = params.get('class');
  return {
    format: params.get('format') === 'wild' ? 'wild' : 'standard',
    classFilter: classFilters.some(item => item.id === classParam) ? classParam as ArchetypeClassFilter : 'all',
  };
}
