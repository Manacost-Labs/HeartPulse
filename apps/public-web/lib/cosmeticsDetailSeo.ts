import type { DetailPayload } from '../../../src/features/Cosmetics';
import type { CosmeticKind } from '../../../src/modules/cosmetics/public';
import { sameOriginPublicResourceUrl } from '../../../shared/publicResourceUrl';

const origin = 'https://hearthpulse.net';

function cleanText(value: unknown, maximum = 300): string | null {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

export function cosmeticsDetailSeo(kind: CosmeticKind, detail: DetailPayload) {
  let name: string;
  let englishName: string | null = null;
  let description: string;
  let imageSource: string | null;
  let artist: string | null = null;
  if (kind === 'heroes') {
    const hero = detail as Extract<DetailPayload, { class: object }>;
    name = cleanText(hero.name.ru) ?? cleanText(hero.name.en) ?? detail.cardId;
    englishName = cleanText(hero.name.en);
    description = `Скин героя Hearthstone: ${cleanText(hero.class.nameRu) ?? 'класс не указан'}, ${cleanText(hero.rarity.nameRu) ?? 'редкость не указана'}. Анимация, полный арт и звуковые дорожки.`;
    imageSource = hero.images.static ?? hero.images.fullArt;
    artist = cleanText(hero.artist);
  } else if (kind === 'coins') {
    const coin = detail as Extract<DetailPayload, { generatedBy: object }>;
    name = cleanText(coin.name.en) ?? cleanText(coin.name.ru) ?? detail.cardId;
    description = `Косметическая монета Hearthstone «${name}»: изображение карты, crop-арт и связанные карты.`;
    imageSource = coin.images.crop ?? coin.images.card;
  } else {
    const pet = detail as Extract<DetailPayload, { pet: object }>;
    name = cleanText(pet.name) ?? detail.cardId;
    description = `Питомец Hearthstone «${name}»: карточка, End Screen, дополнительные арты и другие раскраски семейства.`;
    imageSource = pet.images.card ?? pet.images.endScreen;
  }
  const canonical = `${origin}/cosmetics/${kind}/${encodeURIComponent(detail.cardId)}/`;
  const image = sameOriginPublicResourceUrl(imageSource, origin);
  const title = `${name} — косметика Hearthstone | Manacost`;
  const structured = {
    '@context': 'https://schema.org', '@type': 'CreativeWork', name,
    alternateName: englishName ?? undefined, description, image: image ?? undefined,
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'card_id', value: detail.cardId },
      ...(Number.isInteger(detail.dbf)
        ? [{ '@type': 'PropertyValue', propertyID: 'dbf', value: detail.dbf }] : []),
    ],
    creator: artist ? { '@type': 'Person', name: artist } : undefined,
    url: canonical,
  };
  return { canonical, title, description, image, structured };
}
