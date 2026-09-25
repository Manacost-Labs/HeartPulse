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

/** Keeps catalog selection in the address bar without triggering navigation. */
export function replaceCatalogUrl(nextFormat: ArchetypeFormat, nextClass: ArchetypeClassFilter): void {
  const params = new URLSearchParams({ format: nextFormat });
  if (nextClass !== 'all') params.set('class', nextClass);
  window.history.replaceState(window.history.state, '', `/standard/archetypes?${params.toString()}`);
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
