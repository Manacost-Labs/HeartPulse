import type { PublicCardSeed } from '../../../src/modules/constructedCards/public';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function publicCardSeed(payload: unknown, cardId: string): PublicCardSeed {
  const data = record(payload); const card = record(data.card);
  if (card.id !== cardId || typeof card.name !== 'string' || !card.name.trim()) throw new Error('Invalid public card');
  const image = text(card.image);
  const localImage = image?.startsWith('https://hearthpulse.net/') ? image.slice('https://hearthpulse.net'.length) : image;
  return {
    card_id: cardId, dbf: number(data.dbf), name: { ru: card.name, en: text(card.englishName) },
    text: { ru: text(card.rulesText) }, flavor: { ru: text(card.flavorText) },
    class: text(data.classCode) ?? 'NEUTRAL', card_set: text(card.set), card_type: { name_ru: text(card.type) },
    rarity: text(card.rarity), mana_cost: number(card.mana), attack: number(card.attack), health: number(card.health),
    durability: number(card.durability), armor: number(card.armor), artist: text(card.artist),
    images: { card: localImage ?? null }, stats: null,
  };
}

