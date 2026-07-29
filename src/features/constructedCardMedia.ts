import {
  localizeConstructedMediaLabel,
  localizeConstructedSoundDescription,
} from '../../shared/constructedCardTranslations';
import { publicResourceUrl } from '../publicResourceUrl';
import type {
  ConstructedRelatedCard,
  ConstructedRelatedCardGroup,
} from './constructedRelatedCards';

export type ConstructedCardSound = {
  id: string;
  group: string;
  description: string;
  title: string;
  url: string;
};

export type ConstructedCardMediaItem = {
  id: string;
  label: string;
  description?: string | null;
  url: string;
  thumbnailUrl: string;
  sourceUrl: string | null;
  kind: 'image' | 'video';
  presentation?: 'cover' | 'contain';
};

export type ConstructedCardVariant = {
  id: 'normal' | 'golden' | 'signature' | 'diamond';
  label: string;
  url: string;
};

type JsonRecord = Record<string, any>;

const CONSTRUCTED_CARD_IMAGE_VERSION = 'constructed-cards-blizzard-20260727';

export function constructedCardImageVersion(fallbackValue: unknown): string {
  const fallback = String(fallbackValue ?? '').trim();
  if (!fallback) return CONSTRUCTED_CARD_IMAGE_VERSION;
  try {
    const filename = new URL(fallback).pathname.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
    if (/^[a-f0-9]{24,128}$/i.test(filename)) {
      return `blizzard-${filename.slice(0, 24).toLowerCase()}`;
    }
  } catch {
    // Non-URL fallbacks keep the shared release version.
  }
  return CONSTRUCTED_CARD_IMAGE_VERSION;
}

export function constructedCardRenderImage(
  cardIdValue: unknown,
  fallbackValue?: unknown,
  variant: 'thumb' | 'full' = 'full',
): string | null {
  const cardId = String(cardIdValue ?? '').trim();
  if (/^[A-Za-z0-9_]{1,80}$/.test(cardId)) {
    return `/api/card-image/${encodeURIComponent(cardId)}/${variant}.webp?v=${constructedCardImageVersion(fallbackValue)}`;
  }
  const fallback = String(fallbackValue ?? '').trim();
  return fallback || null;
}

export function constructedGeneratedPoolCardImage(card: JsonRecord): string | null {
  const cardId = String(card?.card_id ?? card?.id ?? '').trim();
  const dbfId = Number(card?.dbf);
  const fallback = String(card?.images?.card ?? card?.image_url ?? card?.image ?? '').trim();
  return constructedCardRenderImage(Number.isInteger(dbfId) && dbfId > 0 ? dbfId : cardId, fallback);
}

export function constructedRelatedCardImage(card: ConstructedRelatedCard): string | null {
  return constructedCardRenderImage(card.dbf ?? card.cardId, card.cardImageUrl);
}

function mediaKind(url: string): 'image' | 'video' {
  return /\.(?:mp4|webm)(?:[?#]|$)/i.test(url) ? 'video' : 'image';
}

function readableMediaLabel(value: unknown, fallback: string): string {
  return localizeConstructedMediaLabel(value, fallback);
}

export function flattenConstructedCardSounds(rawSounds: unknown): ConstructedCardSound[] {
  if (!Array.isArray(rawSounds)) return [];
  const result: ConstructedCardSound[] = [];
  const seen = new Set<string>();

  rawSounds.forEach((group, groupIndex) => {
    if (!group || typeof group !== 'object') return;
    const record = group as JsonRecord;
    const clips = Array.isArray(record.clips) ? record.clips : [record];
    clips.forEach((clip, clipIndex) => {
      if (!clip || typeof clip !== 'object') return;
      const item = clip as JsonRecord;
      const url = publicResourceUrl(item.file_url ?? item.url ?? item.src);
      if (!url || seen.has(url)) return;
      seen.add(url);
      const groupName = String(item.group ?? record.heading ?? record.group ?? 'Sound').trim() || 'Sound';
      result.push({
        id: `${groupIndex}-${clipIndex}-${url}`,
        group: groupName,
        description: localizeConstructedSoundDescription(item.description ?? item.caption),
        title: readableMediaLabel(item.file_title ?? item.name, `Звук ${result.length + 1}`),
        url,
      });
    });
  });

  return result;
}

export function collectConstructedCardMedia(card: JsonRecord): ConstructedCardMediaItem[] {
  const result: ConstructedCardMediaItem[] = [];
  const seen = new Set<string>();
  const push = (id: string, label: string, urlValue: unknown, thumbnailValue?: unknown, sourceValue?: unknown) => {
    const url = publicResourceUrl(urlValue);
    if (!url || seen.has(url)) return;
    seen.add(url);
    result.push({
      id,
      label: readableMediaLabel(label, `Изображение ${result.length + 1}`),
      url,
      thumbnailUrl: publicResourceUrl(thumbnailValue) || url,
      sourceUrl: String(sourceValue ?? '').trim() || null,
      kind: mediaKind(url),
    });
  };

  push(
    'card-normal',
    'Обычная карта',
    constructedCardRenderImage(card?.dbf ?? card?.card_id, card?.images?.card),
  );
  push('card-golden', 'Золотая карта', card?.images?.golden);
  push('card-signature', 'Сигнатурная карта', card?.images?.signature);
  push('card-diamond', 'Алмазная карта', card?.images?.diamond);
  push('card-art', 'Арт карты', card?.images?.crop);
  for (const [variant, label] of [['golden', 'Анимированная золотая'], ['signature', 'Анимированная сигнатурная'], ['diamond', 'Анимированная алмазная']] as const) {
    push(`animated-${variant}`, label, card?.images?.animated?.[variant]);
  }

  const wiki = card?.wiki && typeof card.wiki === 'object' ? card.wiki : {};
  for (const [field, fallback] of [['golden_cards', 'Золотая карта'], ['signature_cards', 'Сигнатурная карта'], ['diamond_cards', 'Алмазная карта']] as const) {
    const entries = Array.isArray(wiki[field]) ? wiki[field] : [];
    entries.forEach((entry: JsonRecord, index: number) => push(
      `${field}-${index}`,
      entry?.label ?? entry?.file_title ?? fallback,
      entry?.file_url ?? entry?.url,
      entry?.thumb_url,
      entry?.file_page_url ?? entry?.wiki_page_url,
    ));
  }
  for (const [variant, label] of [['golden', 'Анимированная золотая'], ['signature', 'Анимированная сигнатурная'], ['diamond', 'Анимированная алмазная']] as const) {
    const entries = Array.isArray(wiki?.animated?.[variant]) ? wiki.animated[variant] : [];
    entries.forEach((entry: JsonRecord, index: number) => push(
      `wiki-animated-${variant}-${index}`,
      entry?.label ?? entry?.file_title ?? label,
      entry?.file_url ?? entry?.url ?? entry?.src,
      entry?.thumb_url,
      entry?.file_page_url,
    ));
  }
  const gallery = Array.isArray(wiki.gallery) ? wiki.gallery : [];
  gallery.forEach((entry: JsonRecord, index: number) => push(
    `gallery-${index}`,
    entry?.caption ?? entry?.file_title ?? `Арт ${index + 1}`,
    entry?.file_url ?? entry?.url,
    entry?.thumb_url,
    entry?.file_page_url,
  ));

  return result;
}

export function collectConstructedCardVariants(card: JsonRecord): ConstructedCardVariant[] {
  const media = collectConstructedCardMedia(card).filter(item => item.kind === 'image');
  const definitions = [
    { id: 'normal', label: 'Обычная', ids: ['card-normal'] },
    { id: 'golden', label: 'Золотая', ids: ['card-golden', 'golden_cards-'] },
    { id: 'signature', label: 'Сигнатурная', ids: ['card-signature', 'signature_cards-'] },
    { id: 'diamond', label: 'Алмазная', ids: ['card-diamond', 'diamond_cards-'] },
  ] as const;

  return definitions.flatMap(definition => {
    const item = media.find(candidate => definition.ids.some(id => (
      id.endsWith('-') ? candidate.id.startsWith(id) : candidate.id === id
    )));
    return item ? [{ id: definition.id, label: definition.label, url: item.url }] : [];
  });
}

export function collectConstructedRelatedCardMedia(
  groups: ConstructedRelatedCardGroup[],
): ConstructedCardMediaItem[] {
  const seen = new Set<string>();
  return groups.flatMap(group => group.cards).flatMap((card, index) => {
    const cardImageUrl = constructedRelatedCardImage(card);
    if (!cardImageUrl || seen.has(cardImageUrl)) return [];
    seen.add(cardImageUrl);
    const label = card.nameRu || card.nameEn || card.cardId || 'Связанная карта';
    return [{
      id: `related-card-${card.cardId || index}`,
      label,
      description: card.cardId || null,
      url: cardImageUrl,
      thumbnailUrl: cardImageUrl,
      sourceUrl: null,
      kind: 'image' as const,
      presentation: 'contain' as const,
    }];
  });
}

export function collectConstructedGeneratedPoolMedia(
  rawPools: unknown,
): ConstructedCardMediaItem[] {
  if (!Array.isArray(rawPools)) return [];
  const seen = new Set<string>();
  const result: ConstructedCardMediaItem[] = [];

  rawPools.forEach((pool, poolIndex) => {
    const cards = Array.isArray(pool?.cards) ? pool.cards : [];
    cards.forEach((card: JsonRecord, cardIndex: number) => {
      const url = constructedGeneratedPoolCardImage(card);
      if (!url || seen.has(url)) return;
      seen.add(url);
      const cardId = String(card?.card_id ?? card?.id ?? '').trim();
      const label = String(
        card?.name?.ru
        ?? card?.name?.en
        ?? card?.name_ru
        ?? card?.title
        ?? cardId
        ?? '',
      ).trim() || 'Карта из пула генерации';
      result.push({
        id: `generated-pool-${cardId || `${poolIndex}-${cardIndex}`}`,
        label,
        description: cardId || null,
        url,
        thumbnailUrl: url,
        sourceUrl: null,
        kind: 'image',
        presentation: 'contain',
      });
    });
  });

  return result;
}

export function collectConstructedRelatedCardArtMedia(
  groups: ConstructedRelatedCardGroup[],
): ConstructedCardMediaItem[] {
  type ArtEntry = {
    card: ConstructedRelatedCard;
    cardIds: string[];
    names: string[];
  };
  const entries = new Map<string, ArtEntry>();

  for (const group of groups) {
    for (const card of group.cards) {
      if (!card.artUrl) continue;
      const sha1 = card.artMetadata?.sha1?.toLocaleLowerCase('en-US');
      const key = sha1 ? `sha1:${sha1}` : `url:${card.artUrl}`;
      const existing = entries.get(key);
      const name = card.nameRu || card.nameEn || card.cardId || 'Связанная карта';
      if (existing) {
        if (card.cardId && !existing.cardIds.includes(card.cardId)) existing.cardIds.push(card.cardId);
        if (!existing.names.includes(name)) existing.names.push(name);
      } else {
        entries.set(key, {
          card,
          cardIds: card.cardId ? [card.cardId] : [],
          names: [name],
        });
      }
    }
  }

  return [...entries.values()].map((entry, index) => {
    const { card } = entry;
    const details = [
      entry.cardIds.length > 0 ? `Карты: ${entry.cardIds.join(', ')}` : null,
      card.artist ? `Художник: ${card.artist}` : null,
      card.artMetadata?.width && card.artMetadata?.height
        ? `Оригинал: ${card.artMetadata.width}×${card.artMetadata.height}`
        : null,
    ].filter((value): value is string => Boolean(value));
    const shared = entry.cardIds.length > 1 ? ' — общий полный арт' : ' — полный арт';
    return {
      id: `related-art-${card.cardId || index}`,
      label: `${entry.names.join(', ')}${shared}`,
      description: details.join(' · ') || null,
      url: publicResourceUrl(card.artUrl),
      thumbnailUrl: publicResourceUrl(card.artUrl),
      sourceUrl: card.artMetadata?.filePageUrl ?? card.wikiUrl,
      kind: 'image',
      presentation: 'contain',
    };
  });
}
