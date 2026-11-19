import { createBattlegroundNameResolver, type BattlegroundCatalogCard } from './battlegroundCatalog.js';
import type { PatchCardResolver } from './parser.js';

type CardName = { name?: unknown; playerClass?: unknown; type?: unknown; dbf?: unknown };

/** Names compare without case, `ё` and the three apostrophes the articles and catalogs mix: `К’Туна`, `К'Туна`, ``К`Туна``. */
export const nameKey = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[’‘`]/g, "'")
  .replace(/\s+/g, ' ').trim();

/**
 * The article names some cards with a qualifier that is not part of the card's
 * name: "Гнев К’Туна — Способность К’Туна" (the card and whose ability it is) and
 * "Темный парадокс (2-й уровень)" (the tavern tier of one of its versions).
 */
export type SplitName = { base: string; /** Text after the dash or inside the brackets. */ qualifier: string | null; tier: number | null };

const DASH_QUALIFIER = /^(.+?)\s+[—–]\s+(Способность\s.+)$/u;
const TIER_QUALIFIER = /^(.+?)\s*\((\d)-?й\s+уровень\)$/iu;

export function splitCardName(name: string): SplitName {
  const text = name.trim();
  const dash = DASH_QUALIFIER.exec(text);
  if (dash) return { base: dash[1].trim(), qualifier: dash[2].trim(), tier: null };
  const tier = TIER_QUALIFIER.exec(text);
  if (tier) return { base: tier[1].trim(), qualifier: `${tier[2]}-й уровень`, tier: Number(tier[2]) };
  return { base: text, qualifier: null, tier: null };
}

/** A name that belongs to cards of two classes is ambiguous and stays unresolved. */
export function createCardNameResolver(cards: Record<string, CardName>): PatchCardResolver {
  const byName = new Map<string, { id: string; cardClass: string | null; cardType: string | null } | null>();
  for (const [id, card] of Object.entries(cards)) {
    const name = typeof card?.name === 'string' ? nameKey(card.name) : '';
    if (!name) continue;
    const cardClass = typeof card.playerClass === 'string' ? card.playerClass : null;
    const cardType = typeof card.type === 'string' ? card.type.toLowerCase() : null;
    const known = byName.get(name);
    if (known === undefined) byName.set(name, { id, cardClass, cardType });
    else if (known && known.cardClass !== cardClass) byName.set(name, null);
    // Reprints share a name and class; the original set id keeps its art.
    else if (known && known.id.startsWith('CORE_') && !id.startsWith('CORE_')) byName.set(name, { id, cardClass, cardType });
  }
  return name => byName.get(nameKey(name)) ?? null;
}

/**
 * A card by the article's spelling first, then by its name without the
 * qualifier; the qualifier then tells which version of the card is meant.
 */
function withQualifier(resolve: PatchCardResolver): PatchCardResolver {
  return (name, context) => {
    const exact = resolve(name, context);
    if (exact) return exact;
    const { base, qualifier, tier } = splitCardName(name);
    if (!qualifier) return null;
    const card = resolve(base, { mode: context?.mode ?? 'constructed', subtitle: context?.subtitle ?? null, tier });
    if (!card) return null;
    // A tier is part of the article's own heading, so the entry keeps it; a dash qualifier becomes the card's line.
    return tier === null ? { ...card, name: card.name ?? base, qualifier } : { ...card, name: undefined };
  };
}

/** Battlegrounds names resolve against the Battlegrounds catalog, every other mode against collectible cards. */
export function createPatchCardResolver(cards: Record<string, CardName>, battlegrounds: BattlegroundCatalogCard[]): PatchCardResolver {
  const collectible = createCardNameResolver(cards);
  const battleground = createBattlegroundNameResolver(battlegrounds);
  return withQualifier((name, context) => (context?.mode === 'battlegrounds' ? battleground(name, context) : collectible(name, context)));
}
