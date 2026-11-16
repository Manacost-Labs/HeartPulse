import type { DetailPayload } from '@/src/features/Cosmetics';
import type { CosmeticKind } from '@/src/modules/cosmetics/public';
import { buildCosmeticStructuredData } from '@/shared/entitySeoStructuredData';
import { sameOriginPublicResourceUrl } from '@/shared/publicResourceUrl';

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
  if (kind === 'heroes') {
    const hero = detail as Extract<DetailPayload, { class: object }>;
    name = cleanText(hero.name.ru) ?? cleanText(hero.name.en) ?? detail.cardId;
    englishName = cleanText(hero.name.en);
    description = `Скин героя Hearthstone: ${cleanText(hero.class.nameRu) ?? 'класс не указан'}, ${cleanText(hero.rarity.nameRu) ?? 'редкость не указана'}. Анимация, полный арт и звуковые дорожки.`;
    imageSource = hero.images.static ?? hero.images.fullArt;
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
  const title = `${name} — косметика Hearthstone | HearthPulse`;
  const structured = buildCosmeticStructuredData({
    origin, kind, cardId: detail.cardId, dbf: detail.dbf, name, englishName, description, image,
  });
  return { canonical, title, description, image, structured };
}
