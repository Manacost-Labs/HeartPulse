/** A card of the hero details payload, as far as its full-card image is concerned. */
export type HeroCardImageSource = { card_id?: string | null; base_card_id?: string | null };

const CARD_ID = /^[A-Za-z0-9_]+$/;

/**
 * The base card of a minion: `base_card_id` from the library, else the id
 * without its golden suffix. `TB_BaconUps_*` golden ids have no pattern, so
 * without the library they stay as they are.
 */
export function heroCardBaseId(card: HeroCardImageSource | undefined): string | null {
  const id = String(card?.base_card_id || card?.card_id || '').trim().replace(/_Gt$/, 't').replace(/_G$/, '');
  return CARD_ID.test(id) ? id : null;
}

/**
 * Full-card images of a minion, best first. Every slot shows a full card: the
 * normal one is the HearthstoneJSON Battlegrounds render, the golden one the
 * golden card stored under the base id. `_G` renders are never used: they
 * show the wrong stats or do not exist.
 */
export function heroCardImageSources(card: HeroCardImageSource | undefined, golden: boolean): string[] {
  const base = heroCardBaseId(card);
  if (!base) return [];
  const normal = [
    `/api/public-resource/hsjson/v1/bgs/latest/ruRU/256x/${base}.png`,
    `/api/public-resource/db/uploads/cards/${base}.png`,
  ];
  return golden ? [`/api/public-resource/db/uploads/golden/${base}.png`, ...normal] : normal;
}

/** Final-board stats can reach five digits, so they are grouped like every other count on the site. */
export function heroMinionStat(value: unknown): string {
  const number = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(number) ? '—' : Math.round(number).toLocaleString('ru-RU');
}
