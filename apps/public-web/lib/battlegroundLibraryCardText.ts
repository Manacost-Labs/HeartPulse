import type { PublicBattlegroundLibraryCard } from './publicBattlegroundLibraryCardData';
import { fitMetaDescription } from '@/src/shared/seo/metaDescription';

const number = (value: number, digits: number) => value.toFixed(digits).replace('.', ',');

/**
 * The one line under the H1 of a card page, a template of the facts the page states (no hand-written text):
 * type and tribe, tavern tier, attack and health, the average place of the base statistics and the mechanics.
 */
export function libraryCardSummary(card: PublicBattlegroundLibraryCard): string {
  const parts = [card.tribe ? `${card.typeName}, ${card.tribe}` : card.typeName];
  if (card.tavernTier !== null) parts.push(`таверна ${card.tavernTier}`);
  if (card.attack !== null && card.health !== null) parts.push(`${card.attack}/${card.health}`);
  if (card.stats) parts.push(`среднее место ${number(card.stats.avgPlacementWith, 2)}`);
  const mechanics = card.mechanics.length ? `: ${card.mechanics.slice(0, 3).join(', ')}` : '';
  return `${parts.join(', ')}${mechanics}.`;
}

/**
 * The meta description: what a searcher asks about a card first (type, tribe, tavern tier, attack and health, the
 * average place of the open statistics), then its text. The name and the text keep it unique; the facts come first,
 * so a long text cut at 160 characters keeps them.
 */
export function libraryCardDescription(card: PublicBattlegroundLibraryCard, archive: boolean): string {
  const type = card.typeName.toLocaleLowerCase('ru-RU');
  const facts = [card.tribe, card.tavernTier !== null ? `таверна ${card.tavernTier}` : null,
    card.attack !== null && card.health !== null ? `${card.attack}/${card.health}` : null,
    card.stats ? `среднее место ${number(card.stats.avgPlacementWith, 2)} в «Топ 50%»` : null].filter(Boolean).join(', ');
  const lead = `${card.name} — ${archive ? `${type} из архива` : type} Полей сражений Hearthstone${facts ? `: ${facts}` : ''}.`;
  const text = String(card.text ?? '').replace(/\s+/g, ' ').trim();
  return fitMetaDescription(text ? `${lead} ${text}${/[.!?…]$/.test(text) ? '' : '.'}` : lead);
}
