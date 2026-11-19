import { FUN_DECK_CLASSES } from '../funDecksPreview';

/** Russian class name and class icon of a deck, by class key such as `deathknight`. */
export function deckClassMeta(classKey: string | null | undefined): { label: string; icon: string } {
  const key = String(classKey || '').toLowerCase().replace(/[^a-z]/g, '');
  const known = FUN_DECK_CLASSES.find(item => item.id === key);
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
