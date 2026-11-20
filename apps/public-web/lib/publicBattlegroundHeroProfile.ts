/**
 * The open profile of a Battlegrounds hero (`profile` of `GET /api/bg/heroes/public/:dbfId`, see
 * `server/battlegroundHeroPublicProfile.ts`): game content of the hero library, read field by field. Pictures must be
 * same-origin resource URLs and links https; a malformed profile is `null` (the page shows the hero without it).
 */
export type PublicHeroCard = { name: string; text: string | null; image: string; imageGold: string | null };

export type PublicBattlegroundHeroProfile = {
  artist: string | null;
  race: string | null;
  health: number | null;
  armor: { normal: number | null; duos: number | null } | null;
  description: string | null;
  fullArt: string | null;
  buddy: (PublicHeroCard & { golden: PublicHeroCard | null }) | null;
  skins: Array<{ cardId: string | null; title: string; image: string; url: string | null }>;
  links: Array<{ label: string; url: string }>;
  patches: Array<{
    heading: string | null;
    entries: Array<{ date: string | null; patch: string | null; patch_url: string | null; wiki_url: string | null; items: string[] }>;
  }>;
};

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string | null => typeof value === 'string' && value ? value : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const image = (value: unknown): string | null =>
  typeof value === 'string' && value.startsWith('https://hearthpulse.net/') ? value : null;
const link = (value: unknown): string | null => typeof value === 'string' && value.startsWith('https://') ? value : null;

function card(value: unknown): PublicHeroCard | null {
  const source = record(value);
  const name = text(source.name);
  const picture = image(source.image);
  return name && picture ? { name, text: text(source.text), image: picture, imageGold: image(source.imageGold) } : null;
}

export function publicBattlegroundHeroProfileOf(answer: unknown): PublicBattlegroundHeroProfile | null {
  const raw = record(answer).profile;
  if (!raw || typeof raw !== 'object') return null;
  const profile = record(raw);
  const armor = record(profile.armor);
  const buddy = card(profile.buddy);
  return {
    artist: text(profile.artist),
    race: text(profile.race),
    health: count(profile.health),
    armor: profile.armor ? { normal: count(armor.normal), duos: count(armor.duos) } : null,
    description: text(profile.description),
    fullArt: image(profile.fullArt),
    buddy: buddy ? { ...buddy, golden: card(record(profile.buddy).golden) } : null,
    skins: list(profile.skins).map(record).flatMap(skin => {
      const title = text(skin.title);
      const picture = image(skin.image);
      return title && picture ? [{ cardId: text(skin.cardId), title, image: picture, url: link(skin.url) }] : [];
    }),
    links: list(profile.links).map(record).flatMap(item => {
      const label = text(item.label);
      const url = link(item.url);
      return label && url ? [{ label, url }] : [];
    }),
    patches: list(profile.patches).map(record).map(group => ({
      heading: text(group.heading),
      entries: list(group.entries).map(record).map(entry => ({
        date: text(entry.date), patch: text(entry.patch), patch_url: link(entry.patch_url), wiki_url: link(entry.wiki_url),
        items: list(entry.items).flatMap(item => typeof item === 'string' && item ? [item] : []),
      })),
    })),
  };
}
