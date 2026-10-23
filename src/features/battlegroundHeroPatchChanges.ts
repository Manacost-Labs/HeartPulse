/**
 * Balance history of a Battlegrounds hero from its wiki page, in the shape of
 * the card page timeline: one entry per patch with short Russian lines and a
 * direction (armor up is a buff), the Manacost article and the wiki link.
 */
import { cardPatchChange, type CardPatchChange, type CardPatchEntry } from './cardPatchChanges';

const ARMOR_PLACES: Record<string, string> = { '': 'Броня', 'in duos': 'Броня в дуо', 'at lower levels': 'Броня на низком рейтинге' };
const LOBBY_TYPES: Record<string, string> = {
  beast: 'зверями', demon: 'демонами', dragon: 'драконами', elemental: 'элементалями', mech: 'механизмами', murloc: 'мурлоками',
  naga: 'нагами', pirate: 'пиратами', quilboar: 'свинобразами', undead: 'нежитью', aberration: 'аберрациями',
};
const OTHER = /^(?:\w+DbfId|battlegroundsHero|duosArmorValue|bg_\w+)\s*:|^(?:Rarity|Class|Artist|Shortened name|Name) is now/i;

const power = (name: string) => name.trim().replace(/\(new version\)/i, '(новая версия)').replace(/\(old version\)/i, '(старая версия)');
const count = (value: string) => (/^(?:none|no)$/i.test(value.trim()) ? 0 : Number(value));
const change = (text: string, before: number, after: number): CardPatchChange => ({
  text: `${text}: ${before} → ${after}`, kind: after > before ? 'buff' : after < before ? 'nerf' : 'change', minor: false,
});
const lobby = (type: string) => {
  const key = type.trim().toLowerCase();
  if (key === 'duos') return 'в дуо';
  return `в лобби ${LOBBY_TYPES[key] ? `${key === 'beast' ? 'со' : 'с'} ${LOBBY_TYPES[key]}` : `«${type.trim()}»`}`;
};

/**
 * One wiki line of a hero. `otherChanges` marks the wiki's "Bug fixes and other
 * changes" group: its free English notes fold into the quiet line, while the
 * known balance grammar still counts as a real change.
 */
export function battlegroundHeroPatchChange(raw: string, otherChanges = false): CardPatchChange {
  const value = String(raw ?? '').trim().replace(/^\d{1,4}-\d{1,2}-\d{1,4}:\s*/, '');
  let match: RegExpMatchArray | null;
  if ((match = value.match(/^Now has (\d+|no) armor(?: (in Duos|at lower levels))? \(previously: (\d+|none)\)\.?$/i))) {
    return change(ARMOR_PLACES[(match[2] ?? '').toLowerCase()], count(match[3]), count(match[1]));
  }
  if ((match = value.match(/^Armor tier is now (\d+) \(previously: (\d+)\)\.?$/i))) return change('Уровень брони', Number(match[2]), Number(match[1]));
  if (/^Armor tier is now/i.test(value)) return { text: value, kind: 'change', minor: true };
  if (/^Added\.?$/i.test(value)) return { text: 'Герой добавлен', kind: 'added', minor: false };
  if (/^Added to the pool of available heroes/i.test(value)) return { text: 'Герой добавлен в пул', kind: 'added', minor: false };
  if (/^Returned to the hero pool/i.test(value)) return { text: 'Герой возвращён в пул', kind: 'added', minor: false };
  if (/^Removed from the pool of available heroes/i.test(value)) return { text: 'Герой убран из пула', kind: 'removed', minor: false };
  if ((match = value.match(/^Hero Power changed from (.+?) to (.+?)\s*\.?$/i))) {
    return { text: `Новая сила героя: «${power(match[2])}» вместо «${power(match[1])}»`, kind: 'change', minor: false };
  }
  if ((match = value.match(/^(Now|No longer) banned in (.+?) lobbies/i))) {
    return { text: `${match[1].toLowerCase() === 'now' ? 'Не выпадает' : 'Снова выпадает'} ${lobby(match[2])}`, kind: 'change', minor: false };
  }
  if ((match = value.match(/^Is (now|no longer) restricted to (.+?) lobbies/i))) {
    return { text: `Выпадает ${match[1].toLowerCase() === 'now' ? 'только' : 'не только'} ${lobby(match[2])}`, kind: 'change', minor: false };
  }
  if (OTHER.test(value)) return { text: value, kind: 'change', minor: true };
  const card = cardPatchChange(value);
  return otherChanges && card.text === value ? { ...card, minor: true } : card;
}

/** "Patch 36.4.2.251332" → "Патч 36.4.2": hero balance often lands in the hotfix, so its number is kept. */
const version = (patch: unknown) => {
  const value = String(patch ?? '').trim();
  const match = value.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return value;
  return `Патч ${match[1]}.${match[2]}${match[3] && match[3] !== '0' ? `.${match[3]}` : ''}`;
};

const text = (value: unknown) => String(value ?? '').trim() || null;
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {});
const isWiki = (url: string | null) => Boolean(url && /wiki\.gg\//i.test(url));

/** The hero's wiki change groups merged by patch, newest first. */
export function battlegroundHeroPatchEntries(groups: unknown): CardPatchEntry[] {
  const byPatch = new Map<string, CardPatchEntry>();
  for (const group of Array.isArray(groups) ? groups : []) {
    const otherChanges = /bug fix|other/i.test(String(record(group).heading ?? ''));
    const entries = record(group).entries;
    for (const entry of Array.isArray(entries) ? entries.map(record) : []) {
      const items = Array.isArray(entry.items) ? entry.items.map(item => battlegroundHeroPatchChange(String(item), otherChanges)) : [];
      if (!items.length && !entry.patch) continue;
      const patchUrl = text(entry.patch_url);
      const wikiUrl = text(entry.wiki_url) ?? (isWiki(patchUrl) ? patchUrl : null);
      const key = `${text(entry.patch) ?? ''}|${text(entry.date) ?? ''}`;
      const known = byPatch.get(key);
      if (known) {
        known.changes.push(...items);
        continue;
      }
      byPatch.set(key, {
        version: version(entry.patch),
        date: text(entry.date),
        changes: items,
        articleUrl: patchUrl && !isWiki(patchUrl) ? patchUrl : null,
        articleTitle: text(entry.patch_title),
        wikiUrl,
      });
    }
  }
  return [...byPatch.values()].sort((left, right) => (Date.parse(right.date ?? '') || 0) - (Date.parse(left.date ?? '') || 0));
}
