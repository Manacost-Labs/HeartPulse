/**
 * The Russian label of an HSGuru archetype name. `translations` is keyed by
 * the lower-cased English name.
 *
 * Without an exact translation the longest translated name contained in it
 * lends its label, and the words it does not cover follow in brackets:
 * HSGuru splits archetypes by a tech card or package ("Harold Piglock" next to
 * "Piglock", "Dragon Pirate Warrior" next to "Pirate Warrior"), and a bare
 * borrowed label would give two different archetypes one name.
 */
export function translateStandardArchetype(name: string, translations: Record<string, string>): string {
  const normalizedName = name.toLowerCase().trim();
  const exact = translations[normalizedName];
  if (exact) return exact;

  let bestKey = '';
  for (const key of Object.keys(translations)) {
    if (key && normalizedName.includes(key) && key.length > bestKey.length) bestKey = key;
  }
  if (!bestKey) return name;
  const label = translations[bestKey];
  const trimmed = name.trim();
  const start = normalizedName.indexOf(bestKey);
  const qualifier = `${trimmed.slice(0, start)} ${trimmed.slice(start + bestKey.length)}`
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:·,]+|[\s\-–—:·,]+$/g, '');
  return qualifier ? `${label} (${qualifier})` : label;
}

/**
 * Labels of one list made distinct: when translations still give different
 * archetypes one label (two names translated alike), every archetype but the
 * shortest-named one adds its English name in brackets. Order is preserved.
 */
export function disambiguateArchetypeLabels<T extends { archetype: string; archetypeLabel: string }>(items: readonly T[]): T[] {
  const byLabel = new Map<string, T[]>();
  for (const item of items) byLabel.set(item.archetypeLabel, [...(byLabel.get(item.archetypeLabel) ?? []), item]);
  const renamed = new Map<T, string>();
  for (const [label, group] of byLabel) {
    const names = new Set(group.map(item => item.archetype.toLowerCase()));
    if (names.size < 2) continue;
    const [kept] = [...group].sort((left, right) => left.archetype.length - right.archetype.length || left.archetype.localeCompare(right.archetype));
    for (const item of group) {
      if (item.archetype.toLowerCase() !== kept.archetype.toLowerCase()) renamed.set(item, `${label} (${item.archetype})`);
    }
  }
  return items.map(item => {
    const archetypeLabel = renamed.get(item);
    return archetypeLabel ? { ...item, archetypeLabel } : item;
  });
}
