import { buildEntityStructuredData } from './entitySeoStructuredData.js';

/**
 * JSON-LD of the cosmetics detail pages. The cosmetics domain rules (routes, section names,
 * identifiers, the title) live here, on top of the domain-independent entity builder, and are
 * shared by the Next page and the server-rendered copy (`server/cosmeticsSeoRoutes.ts`).
 */
type CosmeticStructuredDataOptions = {
  origin: string;
  kind: 'heroes' | 'coins' | 'pets';
  cardId: string;
  dbf: number | null | undefined;
  /** The name the page prints: the graph repeats it. */
  name: string;
  englishName: string | null;
  description: string;
  image: string | null;
};

const COSMETIC_SECTIONS = { heroes: 'Скины героев', coins: 'Косметические монеты', pets: 'Питомцы' } as const;

/**
 * Graph of a cosmetic item page (hero skin, coin, pet): its page, the item, the breadcrumb
 * «Главная → Косметика → раздел → предмет» and the site organization. The one source of the
 * Next page and of the server-rendered copy, so both print the same text. No `creator`:
 * the artist of a card is not the author of the site's page, and the site names no person.
 */
export function buildCosmeticStructuredData(options: CosmeticStructuredDataOptions) {
  const canonical = `${options.origin}/cosmetics/${options.kind}/${encodeURIComponent(options.cardId)}/`;
  const title = `${options.name} — косметика Hearthstone | HearthPulse`;
  return buildEntityStructuredData({
    canonical, title, description: options.description, origin: options.origin, image: options.image,
    entityFragment: 'cosmetic',
    entity: {
      name: options.name,
      ...(options.englishName ? { alternateName: options.englishName } : {}),
      description: options.description,
      inLanguage: 'ru',
      ...(options.image ? { image: options.image } : {}),
      identifier: [
        { '@type': 'PropertyValue', propertyID: 'card_id', value: options.cardId },
        ...(typeof options.dbf === 'number' && Number.isInteger(options.dbf)
          ? [{ '@type': 'PropertyValue', propertyID: 'dbf', value: options.dbf }] : []),
      ],
    },
    breadcrumbs: [
      { name: 'Главная', item: `${options.origin}/` },
      { name: 'Косметика', item: `${options.origin}/cosmetics/` },
      { name: COSMETIC_SECTIONS[options.kind], item: `${options.origin}/cosmetics/${options.kind}/` },
      { name: options.name, item: canonical },
    ],
  });
}
