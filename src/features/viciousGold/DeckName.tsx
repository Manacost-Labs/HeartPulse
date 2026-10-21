import { archetypeHref, deckDisplayLabel, type DeckDistribution, type TierDeck } from './viciousGoldModel';

/**
 * The deck's name as the meta and archetype pages write it, the vS name under it, and a link
 * to our archetype page when the catalog has the archetype.
 */
export function DeckName({ deck, className }: { deck: TierDeck | DeckDistribution; className: string }) {
  const href = archetypeHref(deck.archetypeSlug);
  const label = deckDisplayLabel(deck);
  const body = <><strong>{label}</strong><small lang="en">{deck.deck}</small></>;
  return href
    ? <a className={className} href={href} title={`${label}: страница архетипа`}>{body}</a>
    : <span className={className}>{body}</span>;
}
