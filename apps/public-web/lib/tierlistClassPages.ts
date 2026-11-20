/**
 * The class pages of the Arena tier list (#617): `/tierlist/<slug>/` for each class of the open pool and
 * `/tierlist/neutral/` for the neutral cards, which no class tab lists. The slugs are the pool's class ids;
 * the neutral section's id is `any`. The tier list links its class choice to these pages once they are served.
 */
export const TIERLIST_CLASS_SLUGS = ['death-knight', 'demon-hunter', 'druid', 'hunter', 'mage', 'paladin', 'priest',
  'rogue', 'shaman', 'warlock', 'warrior', 'neutral'] as const;
export type TierlistClassSlug = typeof TIERLIST_CLASS_SLUGS[number];

/** Switched on by the PR that adds the `app/tierlist/[class]` route and its Nginx contract (#617). */
export const TIERLIST_CLASS_PAGES_LIVE = false;

const NEUTRAL_ID = 'any';
const ALL_CARDS_ID = '__all__';

/** The page of a class section of the tier list (`__all__` is the tier list itself). */
export function tierlistClassPath(id: string): string {
  if (id === ALL_CARDS_ID) return '/tierlist/';
  return `/tierlist/${id === NEUTRAL_ID ? 'neutral' : id}/`;
}

/** The section id a class page shows, or `null` for an unknown slug (the page answers 404). */
export function tierlistClassIdFromSlug(slug: string): string | null {
  if (!(TIERLIST_CLASS_SLUGS as readonly string[]).includes(slug)) return null;
  return slug === 'neutral' ? NEUTRAL_ID : slug;
}

/**
 * The H1 and breadcrumb of a class page: its own heading (it matches the page's title, not the tier list's), the
 * neutral cards named as such. `name` is the section's name in the pool («Маг»).
 */
export function tierlistClassPageHeading(id: string, name: string): { title: string; name: string; href: string } {
  return id === NEUTRAL_ID
    ? { title: 'Нейтральные карты Арены Hearthstone', name: 'Нейтральные', href: tierlistClassPath(id) }
    : { title: `Тир-лист карт Арены Hearthstone: ${name}`, name, href: tierlistClassPath(id) };
}
