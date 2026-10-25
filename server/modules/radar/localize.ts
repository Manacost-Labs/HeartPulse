/**
 * Замена английских имён в текстах модели на русские имена сайта: архетипы
 * HSGuru по переводам каталога архетипов, карты по каталогу карт
 * (`name.en` → `name.ru`). Заменяется только целое имя, длинные имена
 * раньше коротких («Ritual of Summoning» целиком, а не «Ritual»), а пары,
 * где русское имя само осталось латиницей, пропускаются. Модель часто
 * пишет «Ритуал призыва (Ritual of Summoning)»: после замены повтор в
 * скобках убирается.
 *
 * Карты заменяются только те, что прогон сам называет (`cardIds`: карты-
 * кандидаты и карты прецедентов): иначе обычные слова совпадают с именами
 * карт — компания «Blizzard» становилась картой мага «Снежная буря».
 * Имена компаний и сервисов (`KEEP`) не заменяются никогда.
 */
export type RadarNameSources = {
  archetypes: Readonly<Record<string, string>>;
  cards?: Iterable<Record<string, unknown>>;
  /** Id карт, которые называет прогон; без него карты не заменяются вовсе. */
  cardIds?: ReadonlySet<string>;
};

const KEEP = new Set(['blizzard', 'reddit', 'twitter', 'hsreplay', 'hsguru', 'hearthstone', 'hearthpwn', 'vicious syndicate', 'firestone']);

const key = (name: string) => name.trim().replace(/\s+/g, ' ').replace(/’/g, "'").toLocaleLowerCase('en-US');

function pairs({ archetypes, cards = [], cardIds = new Set() }: RadarNameSources): Map<string, string> {
  const labels = new Map<string, string>();
  const add = (english: unknown, russian: unknown) => {
    const name = typeof english === 'string' ? key(english) : '';
    const label = typeof russian === 'string' ? russian.trim() : '';
    if (name.length >= 4 && !KEEP.has(name) && /[a-z]/.test(name) && /[а-яё]/i.test(label)) labels.set(name, label);
  };
  for (const card of cards) {
    const id = card.card_id ?? card.cardId ?? card.id;
    if (typeof id !== 'string' || !cardIds.has(id)) continue;
    const name = card.name as { en?: unknown; ru?: unknown } | undefined;
    add(name?.en, name?.ru);
  }
  // Архетипы последними: «C'Thun» карты не должен перебить имя колоды.
  for (const [name, label] of Object.entries(archetypes)) add(name, label);
  return labels;
}

export function createRadarLocalizer(sources: RadarNameSources): (value: string) => string {
  const labels = pairs(sources);
  if (!labels.size) return value => value;
  const names = [...labels.keys()].sort((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]").replace(/ /g, '\\s+'));
  const pattern = new RegExp(`(?<![\\p{L}\\d'’])(?:${names.join('|')})(?![\\p{L}\\d'’])`, 'giu');
  const russian = [...new Set(labels.values())].sort((a, b) => b.length - a.length)
    .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const repeated = new RegExp(`(${russian.join('|')})\\s*\\(\\s*\\1\\s*\\)`, 'gu');
  return value => value.replace(pattern, match => labels.get(key(match)) ?? match).replace(repeated, '$1');
}
