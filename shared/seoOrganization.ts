/**
 * The one `Organization` node of the site, shared by every JSON-LD graph
 * (registry pages, archetypes, guides, cards, heroes, library, cosmetics, and the
 * server-rendered copies of those pages). A page that prints JSON-LD prints this
 * node once and points at it by `@id`: Google resolves an `@id` inside one
 * document only. The brand is HearthPulse; Manacost is its parent organization.
 */
export const SITE_ORIGIN = 'https://hearthpulse.net';
export const ORGANIZATION_ID = `${SITE_ORIGIN}/#org`;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type OrganizationNode = { [key: string]: JsonValue };

// The same two addresses the site footer links as its own channels.
const SAME_AS = ['https://t.me/manacost_ru', 'https://boosty.to/kolodahearthstone'];

/** A fresh copy of the node, so a caller can never change the shared one. */
export function organizationNode(): OrganizationNode {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'HearthPulse',
    url: `${SITE_ORIGIN}/`,
    logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/assets/arena_icon.webp` },
    sameAs: [...SAME_AS],
    parentOrganization: { '@type': 'Organization', name: 'Manacost', sameAs: [...SAME_AS] },
  };
}

/** A reference to the node; the node itself must be in the same document. */
export function organizationReference(): { '@id': string } {
  return { '@id': ORGANIZATION_ID };
}
