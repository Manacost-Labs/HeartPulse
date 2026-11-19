/** Hero classes by the lower-case Latin key of `className`, listed in the order of their Russian names. */
export const DECK_CLASSES: ReadonlyArray<{ id: string; label: string; color: string; icon: string }> = [
  ['warrior', 'Воин', '#8e342f'],
  ['druid', 'Друид', '#8b4d25'],
  ['priest', 'Жрец', '#6e6862'],
  ['mage', 'Маг', '#326c97'],
  ['hunter', 'Охотник', '#3f792f'],
  ['demonhunter', 'Охотник на демонов', '#556d24'],
  ['paladin', 'Паладин', '#a77816'],
  ['rogue', 'Разбойник', '#55545b'],
  ['deathknight', 'Рыцарь смерти', '#397b87'],
  ['warlock', 'Чернокнижник', '#694477'],
  ['shaman', 'Шаман', '#345aa0'],
].map(([id, label, color]) => ({ id, label, color, icon: `/class_icon/ui/${id}-64.webp` }));


/** Russian class name and class icon of a deck, by class key such as `deathknight`. */
export function deckClassMeta(classKey: string | null | undefined): { label: string; icon: string } {
  const key = String(classKey || '').toLowerCase().replace(/[^a-z]/g, '');
  const known = DECK_CLASSES.find(item => item.id === key);
  return known ? { label: known.label, icon: known.icon } : { label: 'Класс определяется', icon: '/arena-logo-icon.webp' };
}

/** «1 сборка», «2 сборки», «5 сборок». */
export function pluralRu(count: number, [one, few, many]: readonly [string, string, string]): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  return units >= 2 && units <= 4 ? few : many;
}
