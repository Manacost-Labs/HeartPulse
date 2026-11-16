// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';

export const SENTINEL = 'ZQXSENTINELWORD';

/** `count` words in sentences of ten: `a0 a1 ... a9.` */
export function words(count: number, prefix: string): string {
  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    parts.push(`${prefix}${index}${index % 10 === 9 || index === count - 1 ? '.' : ''}`);
  }
  return parts.join(' ');
}

export function countWords(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
}

const GUIDES: Array<[number, string, string, string, string, string]> = [
  // slug, title, free_html, body_html, short_html
  [1, 'sentinel-guide', 'Гайд с платной частью',
    `<p>${words(100, 'вступление')}</p><h2>Вступление</h2><p>${words(100, 'начало')}</p>`,
    `<h2>Платная глава</h2><p>${words(150, 'платно')} ${SENTINEL} ${words(30, 'хвост')}</p>`
    + '<h3>Колоды</h3><p><img src="/deck.png" data-clipboard-text="AAEBAZICAA8PAAAAAAAAAA=="></p>', ''],
  [2, 'fits-guide', 'Гайд целиком в открытой части', `<p>${words(170, 'целиком')}</p>`, '', ''],
  [3, 'long-first-paragraph', 'Один длинный абзац', `<p>${words(300, 'длинный')}</p>`, '', ''],
  [4, 'short-guide', 'Короткий гайд', `<p>${words(95, 'коротко')}</p>`, '', ''],
  [5, 'fits-with-deck', 'Гайд с колодой', `<p>${words(170, 'колода')}</p><p><img src="/deck.png"></p>`, '', ''],
  [6, 'toc-code-guide', 'Гайд с кодами в заголовках',
    `<p>${words(170, 'оглавление')}</p><h2>Раздел <img data-clipboard-text="AAEBAZICAA8PAAAAAAAAAA=="></h2>`
    + '<h3><img data-clipboard-text="AAECAQcE0gKS+AKgAAAAAAAAAAAAAA=="></h3><h3>Колода <code>AAEBAZICAA8PAAAAAAAAAB==</code> дня</h3>',
    '', ''],
];

export function createGuideExcerptDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE guides (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, old_url TEXT, published_at INTEGER, published_iso TEXT,
      title TEXT, description TEXT, keywords TEXT, image TEXT, menu_name TEXT, menu_code TEXT, kind TEXT,
      kind_slug TEXT, short_html TEXT, free_html TEXT, body_html TEXT, body_text TEXT, reply_count INTEGER
    );
  `);
  const insert = database.prepare(`
    INSERT INTO guides VALUES (?, ?, NULL, 100, '2017-10-10 20:40:00', ?, ?, '', '/images/a.png',
      'Арена', 'arena', 'Гайды', 'guides', ?, ?, ?, '', 0)
  `);
  for (const [id, slug, title, free, body, short] of GUIDES) {
    insert.run(id, slug, title, `Описание ${slug}`, short, free, body);
  }
  return database;
}
