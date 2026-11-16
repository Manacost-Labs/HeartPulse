import type { DetailPayload } from '@/src/features/Cosmetics';
import type { CosmeticKind } from '@/src/modules/cosmetics/public';
import { buildCosmeticStructuredData } from '@/shared/cosmeticsSeoStructuredData';
import { sameOriginPublicResourceUrl } from '@/shared/publicResourceUrl';
import { cosmeticDescription, cosmeticTitle } from '@/shared/entityPageTitles';

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
    description = cosmeticDescription({
      kind, name, id: detail.cardId, className: cleanText(hero.class.nameRu), rarity: cleanText(hero.rarity.nameRu),
    });
    imageSource = hero.images.static ?? hero.images.fullArt;
  } else if (kind === 'coins') {
    const coin = detail as Extract<DetailPayload, { generatedBy: object }>;
    name = cleanText(coin.name.en) ?? cleanText(coin.name.ru) ?? detail.cardId;
    description = cosmeticDescription({ kind, name });
    imageSource = coin.images.crop ?? coin.images.card;
  } else {
    const pet = detail as Extract<DetailPayload, { pet: object }>;
    name = cleanText(pet.name) ?? detail.cardId;
    description = cosmeticDescription({ kind, name });
    imageSource = pet.images.card ?? pet.images.endScreen;
  }
  const canonical = `${origin}/cosmetics/${kind}/${encodeURIComponent(detail.cardId)}/`;
  const image = sameOriginPublicResourceUrl(imageSource, origin);
  const title = cosmeticTitle({
    kind, name, id: detail.cardId,
    className: kind === 'heroes' ? cleanText((detail as Extract<DetailPayload, { class: object }>).class.nameRu) : null,
  });
  const structured = buildCosmeticStructuredData({
    origin, kind, cardId: detail.cardId, dbf: detail.dbf, name, englishName, description, image,
  });
  return { canonical, title, description, image, structured };
}
