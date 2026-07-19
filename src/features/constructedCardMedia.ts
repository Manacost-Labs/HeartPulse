import {
  localizeConstructedMediaLabel,
  localizeConstructedSoundDescription,
} from '../../shared/constructedCardTranslations';

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
  url: string;
  thumbnailUrl: string;
  sourceUrl: string | null;
  kind: 'image' | 'video';
};

export type ConstructedCardVariant = {
  id: 'normal' | 'golden' | 'signature' | 'diamond';
  label: string;
  url: string;
};

type JsonRecord = Record<string, any>;

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
      const url = String(item.file_url ?? item.url ?? item.src ?? '').trim();
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
    const url = String(urlValue ?? '').trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    result.push({
      id,
      label: readableMediaLabel(label, `Изображение ${result.length + 1}`),
      url,
      thumbnailUrl: String(thumbnailValue ?? '').trim() || url,
      sourceUrl: String(sourceValue ?? '').trim() || null,
      kind: mediaKind(url),
    });
  };

  push('card-normal', 'Обычная карта', card?.images?.card);
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
