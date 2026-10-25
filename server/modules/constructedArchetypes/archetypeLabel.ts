import { autoArchetypeLabel } from './autoArchetypeLabel.js';
import { ARCHETYPE_FALLBACK_LABELS } from './fallbackTranslations.js';

/** Lookup key of an English archetype name: trimmed, single-spaced, lower-cased. */
export function archetypeTranslationKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

/** The built-in labels keyed by `archetypeTranslationKey`; callers layer the admin table over it. */
export function archetypeFallbackTranslations(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ARCHETYPE_FALLBACK_LABELS).map(([name, label]) => [archetypeTranslationKey(name), label]),
  );
}

export type ArchetypeTranslationMatch = {
  /** Translation key that matched: the whole name, or the longest contained one. */
  key: string;
  label: string;
  /** Words of the name the key does not cover; empty for an exact match. */
  qualifier: string;
};

/**
 * The only archetype-name matcher. `translations` may use any key casing or
 * spacing. An exact key wins; otherwise the longest key contained in the name
 * lends its label, and the uncovered words become the qualifier: HSGuru splits
 * archetypes by a tech card or package ("Harold Piglock" next to "Piglock",
 * "Dragon Pirate Warrior" next to "Pirate Warrior"), and a bare borrowed label
 * would give two different archetypes one name.
 */
export function matchArchetypeTranslation(
  name: string,
  translations: Readonly<Record<string, string>>,
): ArchetypeTranslationMatch | null {
  const normalizedName = archetypeTranslationKey(name);
  if (!normalizedName) return null;
  let bestKey = '';
  let bestLabel = '';
  for (const [rawKey, rawLabel] of Object.entries(translations)) {
    const key = archetypeTranslationKey(rawKey);
    const label = String(rawLabel ?? '').trim();
    if (!key || !label) continue;
    if (key === normalizedName) return { key, label, qualifier: '' };
    if (normalizedName.includes(key) && key.length > bestKey.length) {
      bestKey = key;
      bestLabel = label;
    }
  }
  if (!bestKey) return null;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const start = normalizedName.indexOf(bestKey);
  const qualifier = `${trimmed.slice(0, start)} ${trimmed.slice(start + bestKey.length)}`
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:·,]+|[\s\-–—:·,]+$/g, '');
  return { key: bestKey, label: bestLabel, qualifier };
}

/**
 * The Russian label of an HSGuru archetype name: the exact translation; else
 * the automatic label when it covers every word («Тиранда Жрец»); else the
 * longest contained translation with the uncovered words in brackets
 * ("Harold Piglock" → "Чернокнижник с Расхождением (Harold)"); else the
 * automatic label with its unknown words; else the English name unchanged.
 */
export function archetypeLabel(name: string, translations: Readonly<Record<string, string>>): string {
  const match = matchArchetypeTranslation(name, translations);
  if (match && !match.qualifier) return match.label;
  const auto = autoArchetypeLabel(name);
  if (auto && !auto.unknown.length) return auto.label;
  if (match) return `${match.label} (${match.qualifier})`;
  return auto?.label ?? name;
}

export type ArchetypeTranslationRow = { nameEn: string; nameRu: string; source: string };

/**
 * The translation map of the site, lowest layer first: rows imported from
 * BlizzCore, then the built-in labels (`fallbackTranslations.ts`, which fix
 * BlizzCore's transliterations and survive its next sync), then the admin's
 * manual rows, which always win. Names none of them covers get
 * `autoArchetypeLabel` in `archetypeLabel`.
 */
export function layerArchetypeTranslations(rows: readonly ArchetypeTranslationRow[]): Record<string, string> {
  const imported: Record<string, string> = {};
  const manual: Record<string, string> = {};
  for (const row of rows) {
    const key = archetypeTranslationKey(String(row.nameEn ?? ''));
    const label = String(row.nameRu ?? '').trim();
    if (key && label) (row.source === 'manual' ? manual : imported)[key] = label;
  }
  return { ...imported, ...archetypeFallbackTranslations(), ...manual };
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

/**
 * Russian labels shared by different English names, case-insensitively.
 * The admin shows these so a translator can tell the archetypes apart; an
 * alias pair (Harold DH / Herald DH) appears here too and is resolved there.
 */
export function findDuplicateArchetypeLabels(
  translations: ReadonlyArray<{ nameEn: string; nameRu: string }>,
): Array<{ nameRu: string; namesEn: string[] }> {
  const groups = new Map<string, { nameRu: string; namesEn: Map<string, string> }>();
  for (const { nameEn, nameRu } of translations) {
    const label = String(nameRu ?? '').trim();
    const english = String(nameEn ?? '').trim();
    if (!label || !english) continue;
    const labelKey = label.toLocaleLowerCase('ru-RU');
    const group = groups.get(labelKey) ?? { nameRu: label, namesEn: new Map<string, string>() };
    group.namesEn.set(archetypeTranslationKey(english), english);
    groups.set(labelKey, group);
  }
  return [...groups.values()]
    .filter(group => group.namesEn.size > 1)
    .map(group => ({
      nameRu: group.nameRu,
      namesEn: [...group.namesEn.values()].sort((left, right) => left.localeCompare(right, 'en')),
    }))
    .sort((left, right) => left.nameRu.localeCompare(right.nameRu, 'ru'));
}
