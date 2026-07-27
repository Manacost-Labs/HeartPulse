import { Router, type RequestHandler, type Response } from 'express';
import type {
  ConstructedCardCollection,
  ConstructedCardDetailResult,
  ConstructedCardFormat,
} from './constructedCardRoutes.js';
import {
  normalizeConstructedRelatedCardGroups,
  type ConstructedRelatedCard,
  type ConstructedRelatedCardGroup,
} from '../src/features/constructedRelatedCards.js';

type JsonRecord = Record<string, unknown>;

export type PublicConstructedCardSeoData = {
  id: string;
  name: string;
  englishName: string | null;
  rulesText: string | null;
  flavorText: string | null;
  set: string | null;
  type: string | null;
  className: string | null;
  rarity: string | null;
  mana: number | null;
  attack: number | null;
  health: number | null;
  durability: number | null;
  armor: number | null;
  artist: string | null;
  image: string | null;
};

export type ConstructedCardSeoRouterDependencies = {
  loadCards: (format: ConstructedCardFormat) => Promise<ConstructedCardCollection>;
  loadCardDetail: (
    format: ConstructedCardFormat,
    cardId: string,
  ) => Promise<ConstructedCardDetailResult | null>;
  canonicalOrigin?: string;
  frontendAssets?: string;
  catalogTimeoutMs?: number;
  retryAfterSeconds?: number;
  onError?: (error: unknown) => void;
};

const CANONICAL_ORIGIN = 'https://arena.hs-manacost.ru';
const INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const NOINDEX_ROBOTS = 'noindex, nofollow';
const FORMAT_LABELS: Record<ConstructedCardFormat, string> = {
  standard: 'Стандарт',
  wild: 'Вольный формат',
};
const CLASS_LABELS: Record<string, string> = {
  DEATHKNIGHT: 'Рыцарь смерти',
  DEMONHUNTER: 'Охотник на демонов',
  DRUID: 'Друид',
  HUNTER: 'Охотник',
  MAGE: 'Маг',
  PALADIN: 'Паладин',
  PRIEST: 'Жрец',
  ROGUE: 'Разбойник',
  SHAMAN: 'Шаман',
  WARLOCK: 'Чернокнижник',
  WARRIOR: 'Воин',
  NEUTRAL: 'Нейтральная карта',
};
const RARITY_LABELS: Record<string, string> = {
  FREE: 'Базовая',
  COMMON: 'Обычная',
  RARE: 'Редкая',
  EPIC: 'Эпическая',
  LEGENDARY: 'Легендарная',
};
const TYPE_LABELS: Record<string, string> = {
  MINION: 'Существо',
  SPELL: 'Заклинание',
  WEAPON: 'Оружие',
  LOCATION: 'Локация',
  HERO: 'Герой',
  ENCHANTMENT: 'Эффект',
};
const SET_LABELS: Record<string, string> = {
  ESCAPEFROM_VIOLET_HOLD: 'Побег из Аметистовой крепости',
  CATACLYSM: 'Катаклизм',
  TIME_TRAVEL: 'Сквозь потоки времени',
  THE_LOST_CITY: 'Затерянный город Ун’Горо',
  EMERALD_DREAM: 'В Изумрудный Сон',
  SPACE: 'Бескрайняя тьма',
  ISLAND_VACATION: 'Раздор в тропиках',
  WHIZBANGS_WORKSHOP: 'Мастерская Чудастера',
  WILD_WEST: 'Битва в Бесплодных землях',
  WONDERS: 'Пещеры Времени',
  TITANS: 'ТИТАНЫ',
  BATTLE_OF_THE_BANDS: 'Фестиваль легенд',
  RETURN_OF_THE_LICH_KING: 'Марш Короля-лича',
  PATH_OF_ARTHAS: 'Путь Артаса',
  REVENDRETH: 'Убийство в замке Нафрия',
  THE_SUNKEN_CITY: 'Путешествие в Затонувший город',
  ALTERAC_VALLEY: 'Разделённые Альтераком',
  STORMWIND: 'Сплочённые Штормградом',
  THE_BARRENS: 'Закалённые Степями',
  DARKMOON_FAIRE: 'Ярмарка безумия',
  SCHOLOMANCE: 'Некроситет',
  BLACK_TEMPLE: 'Руины Запределья',
  YEAR_OF_THE_DRAGON: 'Пробуждение Галакронда',
  DRAGONS: 'Натиск драконов',
  ULDUM: 'Спасители Ульдума',
  DALARAN: 'Возмездие теней',
  TROLL: 'Растахановы игрища',
  BOOMSDAY: 'Проект Бумного дня',
  GILNEAS: 'Ведьмин лес',
  LOOTAPALOOZA: 'Кобольды и катакомбы',
  ICECROWN: 'Рыцари Ледяного Трона',
  UNGORO: 'Экспедиция в Ун’Горо',
  GANGS: 'Злачный город Прибамбасск',
  KARA: 'Вечеринка в Каражане',
  OG: 'Пробуждение древних богов',
  LOE: 'Лига исследователей',
  TGT: 'Большой турнир',
  BRM: 'Чёрная гора',
  GVG: 'Гоблины и гномы',
  NAXX: 'Проклятие Наксрамаса',
  DEMON_HUNTER_INITIATE: 'Иллидари',
  EXPERT1: 'Классический набор',
  CORE: 'Основной набор',
  LEGACY: 'Наследие',
  EVENT: 'Событийный набор',
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown, maximum = 500): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function plainCatalogText(value: unknown, maximum = 500): string | null {
  const normalized = text(value, maximum * 2);
  if (!normalized) return null;
  const plain = normalized
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[[^\]]+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain ? plain.slice(0, maximum) : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function codeLabel(value: string | null, labels: Record<string, string>): string | null {
  if (!value) return null;
  const normalized = value.toLocaleUpperCase('en-US');
  return labels[normalized]
    ?? normalized.toLocaleLowerCase('ru').replace(/_/g, ' ').replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('ru'));
}

export function isIndexableConstructedCard(card: JsonRecord): boolean {
  const id = text(card.card_id, 80) ?? '';
  const name = record(card.name);
  const publicName = text(name.ru, 180) ?? text(name.en, 180);
  return card.catalogPending !== true
    && /^[A-Za-z0-9_]{2,80}$/.test(id)
    && Boolean(publicName);
}

export function projectPublicConstructedCardSeoData(
  card: JsonRecord,
  originValue?: string,
): PublicConstructedCardSeoData {
  const name = record(card.name);
  const cardText = record(card.text);
  const flavor = record(card.flavor);
  const cardType = record(card.card_type);
  const images = record(card.images);
  const id = text(card.card_id, 80) ?? '';
  return {
    id,
    name: text(name.ru, 180) ?? text(name.en, 180) ?? id,
    englishName: text(name.en, 180),
    rulesText: plainCatalogText(cardText.ru ?? cardText.en, 500),
    flavorText: plainCatalogText(flavor.ru ?? flavor.en, 400),
    set: codeLabel(text(card.card_set, 100), SET_LABELS),
    type: text(cardType.name_ru, 100) ?? codeLabel(text(cardType.slug, 100), TYPE_LABELS),
    className: codeLabel(text(card.class, 100), CLASS_LABELS),
    rarity: codeLabel(text(card.rarity, 100), RARITY_LABELS),
    mana: finiteNumber(card.mana_cost),
    attack: finiteNumber(card.attack),
    health: finiteNumber(card.health),
    durability: finiteNumber(card.durability),
    armor: finiteNumber(card.armor),
    artist: text(card.artist, 180),
    image: safeImageUrl(text(images.card, 1_000), canonicalOrigin(originValue)),
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function canonicalOrigin(value: string | undefined): string {
  try {
    const parsed = new URL(value ?? CANONICAL_ORIGIN);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return CANONICAL_ORIGIN;
    return parsed.origin;
  } catch {
    return CANONICAL_ORIGIN;
  }
}

function safeImageUrl(value: string | null, origin: string): string {
  const fallback = `${origin}/assets/og-preview.png`;
  if (!value) return fallback;
  try {
    const parsed = new URL(value, `${origin}/`);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : fallback;
  } catch {
    return fallback;
  }
}

function safeOptionalMediaUrl(value: string | null, origin: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, `${origin}/`);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function renderRelatedCardFacts(card: ConstructedRelatedCard): string {
  const facts: Array<[string, number | null]> = [
    ['Мана', card.manaCost],
    ['Атака', card.attack],
    ['Здоровье', card.health],
  ];
  return facts
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('');
}

function renderRelatedCards(card: JsonRecord, origin: string): string {
  const groups = normalizeConstructedRelatedCardGroups(card);
  if (groups.length === 0) return '';

  const total = groups.reduce((sum, group) => sum + group.cards.length, 0);
  const groupHtml = groups.map((group: ConstructedRelatedCardGroup) => {
    const cards = group.cards.map(item => {
      const name = item.nameRu ?? item.nameEn ?? item.cardId ?? 'Связанная карта';
      const cardImage = safeOptionalMediaUrl(item.cardImageUrl, origin);
      const wikiUrl = safeOptionalMediaUrl(item.wikiUrl, origin);
      const rules = plainCatalogText(item.textRu ?? item.textEn, 500);
      const facts = renderRelatedCardFacts(item);
      return `<article class="card-seo__related-card">
          <div class="card-seo__related-card-image">${cardImage
            ? `<img src="${escapeHtml(cardImage)}" alt="Карта Hearthstone «${escapeHtml(name)}»" loading="lazy">`
            : '<span aria-hidden="true">✦</span>'}</div>
          <div class="card-seo__related-card-copy">
            <h4>${escapeHtml(name)}</h4>
            ${item.nameEn && item.nameEn !== name ? `<p lang="en">${escapeHtml(item.nameEn)}</p>` : ''}
            ${facts ? `<dl>${facts}</dl>` : ''}
            ${rules ? `<p>${escapeHtml(rules)}</p>` : ''}
            ${item.cardId ? `<code>${escapeHtml(item.cardId)}</code>` : ''}
            ${wikiUrl ? `<a href="${escapeHtml(wikiUrl)}" target="_blank" rel="noreferrer">Hearthstone Wiki</a>` : ''}
          </div>
        </article>`;
    }).join('');
    return `<section class="card-seo__related-group">
        <header><div><h3>${escapeHtml(group.headingRu)}</h3>${group.headingEn && group.headingEn !== group.headingRu
          ? `<p lang="en">${escapeHtml(group.headingEn)}</p>`
          : ''}</div><strong>${group.cards.length}</strong></header>
        <div class="card-seo__related-grid">${cards}</div>
      </section>`;
  }).join('');

  const arts = new Map<string, {
    card: ConstructedRelatedCard;
    cardIds: string[];
    names: string[];
    artUrl: string;
  }>();
  for (const group of groups) {
    for (const item of group.cards) {
      const artUrl = safeOptionalMediaUrl(item.artUrl, origin);
      if (!artUrl) continue;
      const sha1 = item.artMetadata?.sha1?.toLocaleLowerCase('en-US');
      const key = sha1 ? `sha1:${sha1}` : `url:${artUrl}`;
      const name = item.nameRu ?? item.nameEn ?? item.cardId ?? 'Связанная карта';
      const existing = arts.get(key);
      if (existing) {
        if (item.cardId && !existing.cardIds.includes(item.cardId)) existing.cardIds.push(item.cardId);
        if (!existing.names.includes(name)) existing.names.push(name);
        continue;
      }
      arts.set(key, {
        card: item,
        cardIds: item.cardId ? [item.cardId] : [],
        names: [name],
        artUrl,
      });
    }
  }
  const gallery = [...arts.values()].map(entry => {
    const sourceUrl = safeOptionalMediaUrl(
      entry.card.artMetadata?.filePageUrl ?? entry.card.wikiUrl,
      origin,
    );
    const dimensions = entry.card.artMetadata?.width && entry.card.artMetadata?.height
      ? `${entry.card.artMetadata.width}×${entry.card.artMetadata.height}`
      : null;
    const label = `${entry.names.join(', ')} — ${entry.cardIds.length > 1 ? 'общий полный арт' : 'полный арт'}`;
    return `<figure class="card-seo__art">
        <a href="${escapeHtml(entry.artUrl)}" target="_blank" rel="noreferrer">
          <img src="${escapeHtml(entry.artUrl)}" alt="${escapeHtml(label)}" loading="lazy">
        </a>
        <figcaption><strong>${escapeHtml(label)}</strong>${entry.cardIds.length
          ? `<span>Карты: ${escapeHtml(entry.cardIds.join(', '))}</span>`
          : ''}${dimensions ? `<span>Оригинал: ${escapeHtml(dimensions)}</span>` : ''}${sourceUrl
          ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Источник на Hearthstone Wiki</a>`
          : ''}</figcaption>
      </figure>`;
  }).join('');

  return `<section class="card-seo__related">
      <h2>Токены, награды и связанные карты · ${total}</h2>
      <div class="card-seo__related-groups">${groupHtml}</div>
      ${gallery ? `<section class="card-seo__art-gallery"><h3>Полноразмерные арты · ${arts.size}</h3><div>${gallery}</div></section>` : ''}
    </section>`;
}

function isBuildAssetPath(value: string): boolean {
  return /^\/assets\/[A-Za-z0-9][A-Za-z0-9._/-]*(?:\?v=[a-f0-9]{7,40})?$/i.test(value)
    && !value.includes('..')
    && !value.includes('//');
}

/**
 * Extract only immutable Vite asset URLs from the trusted built shell. Tags
 * are reconstructed instead of copied so unrelated scripts and attributes
 * cannot enter the entity document.
 */
export function extractConstructedCardFrontendAssets(shellHtml: string): string {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const match of shellHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)) {
    const source = match[1];
    if (!isBuildAssetPath(source) || seen.has(`script:${source}`)) continue;
    seen.add(`script:${source}`);
    tags.push(`<script type="module" crossorigin src="${source}"></script>`);
  }
  for (const match of shellHtml.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = match[1];
    const href = attributes.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? '';
    const rel = attributes.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLocaleLowerCase('en-US') ?? '';
    if (!isBuildAssetPath(href) || !['modulepreload', 'stylesheet'].includes(rel) || seen.has(`${rel}:${href}`)) continue;
    seen.add(`${rel}:${href}`);
    tags.push(`<link rel="${rel}" crossorigin href="${href}">`);
  }
  return tags.join('\n    ');
}

function descriptionForCard(card: PublicConstructedCardSeoData, format: ConstructedCardFormat): string {
  if (card.rulesText) return `${card.name} (${FORMAT_LABELS[format]}, ID ${card.id}): ${card.rulesText}`.slice(0, 300);
  const facts = [
    card.type,
    card.className,
    card.mana === null ? null : `${card.mana} маны`,
    card.set,
  ].filter((value): value is string => Boolean(value));
  return `${card.name} — карта Hearthstone (${FORMAT_LABELS[format]}, ID ${card.id}). ${facts.join(', ') || 'Публичный профиль карты'}.`.slice(0, 300);
}

function renderFacts(card: PublicConstructedCardSeoData, format: ConstructedCardFormat): string {
  const facts: Array<[string, string | number | null]> = [
    ['Формат', FORMAT_LABELS[format]],
    ['Мана', card.mana],
    ['Класс', card.className],
    ['Тип', card.type],
    ['Редкость', card.rarity],
    ['Дополнение', card.set],
    ['Атака', card.attack],
    ['Здоровье', card.health],
    ['Прочность', card.durability],
    ['Броня', card.armor],
    ['Художник', card.artist],
  ];
  const rows = facts
    .filter((entry): entry is [string, string | number] => entry[1] !== null)
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('');
  return `${rows}<div><dt>ID карты</dt><dd><code>${escapeHtml(card.id)}</code></dd></div>`;
}

function baseDocument(options: {
  title: string;
  description: string;
  robots: string;
  body: string;
  frontendAssets: string;
  canonical?: string;
  image?: string;
  structuredData?: unknown;
  structuredDataPath?: string;
  routeStatus?: '200' | '404' | '503';
}): string {
  const title = escapeHtml(options.title);
  const description = escapeHtml(options.description);
  const canonical = options.canonical ? escapeHtml(options.canonical) : null;
  const image = options.image ? escapeHtml(options.image) : null;
  const frontendAssets = extractConstructedCardFrontendAssets(options.frontendAssets);
  const structuredData = options.structuredData === undefined
    ? ''
    : `\n    <script type="application/ld+json"${options.structuredDataPath
      ? ` data-server-entity-jsonld data-entity-path="${escapeHtml(options.structuredDataPath)}"`
      : ''}>${JSON.stringify(options.structuredData)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')}</script>`;
  const social = canonical && image ? `
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Manacost Stats">
    <meta property="og:locale" content="ru_RU">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:alt" content="${title}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">
    <meta name="twitter:image:alt" content="${title}">` : '';
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="robots" content="${escapeHtml(options.robots)}">
    ${canonical ? `<link rel="canonical" href="${canonical}">` : ''}${social}${structuredData}
    <link rel="icon" type="image/png" href="/favicon-16.png?v=hearthstone-cute-20260727" sizes="16x16">
    <link rel="icon" type="image/png" href="/favicon-32.png?v=hearthstone-cute-20260727" sizes="32x32">
    <link rel="icon" type="image/png" href="/favicon-96.png?v=hearthstone-cute-20260727" sizes="96x96">
    <link rel="icon" type="image/x-icon" href="/favicon.ico?v=hearthstone-cute-20260727">
    <link rel="apple-touch-icon" type="image/png" href="/apple-touch-icon.png?v=hearthstone-cute-20260727" sizes="180x180">
    ${frontendAssets}
    <style>
      .card-seo{box-sizing:border-box;max-width:1040px;margin:0 auto;padding:32px 20px;font-family:Inter,system-ui,sans-serif;color:#2b1b16}
      .card-seo a{color:#7b1f2d}.card-seo__hero{display:grid;grid-template-columns:minmax(220px,360px) 1fr;gap:32px;align-items:start}
      .card-seo__image{display:block;width:100%;height:auto;max-height:520px;object-fit:contain}.card-seo h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.05;margin:.35em 0}
      .card-seo dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.card-seo dl div{padding:10px;background:#f3e0b9;border:1px solid #b68a4f}
      .card-seo dt{font-size:.8rem;color:#69482e}.card-seo dd{margin:2px 0 0;font-weight:700}.card-seo__copy{font-size:1.05rem;line-height:1.6}
      .card-seo__related{margin-top:40px}.card-seo__related>h2,.card-seo__art-gallery>h3{font-size:1.55rem}
      .card-seo__related-groups{display:grid;gap:18px}.card-seo__related-group{border:1px solid #b68a4f;background:#fffaf0}
      .card-seo__related-group>header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;background:#f3e0b9}
      .card-seo__related-group h3,.card-seo__related-group p,.card-seo__related-card h4,.card-seo__related-card p{margin:0}.card-seo__related-group header p{color:#69482e}
      .card-seo__related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;padding:12px}
      .card-seo__related-card{display:grid;grid-template-columns:126px minmax(0,1fr);border:1px solid #d7bb83;background:#fff}
      .card-seo__related-card-image{display:grid;min-height:184px;place-items:center;background:#f7edd8}.card-seo__related-card-image img{width:124px;height:184px;object-fit:contain}
      .card-seo__related-card-copy{display:grid;align-content:center;gap:6px;padding:10px}.card-seo__related-card-copy dl{grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin:0}
      .card-seo__related-card-copy dl div{min-width:0;padding:4px}.card-seo__related-card-copy dt{font-size:.68rem}.card-seo__related-card-copy>p{font-size:.9rem;line-height:1.4}.card-seo__related-card-copy code{font-size:.8rem}
      .card-seo__art-gallery{margin-top:28px}.card-seo__art-gallery>div{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
      .card-seo__art{display:grid;margin:0;border:1px solid #b68a4f;background:#17110d}.card-seo__art>a:first-child{display:grid;min-height:320px;place-items:center}
      .card-seo__art img{display:block;width:100%;height:360px;object-fit:contain}.card-seo__art figcaption{display:grid;gap:4px;padding:12px;color:#f8e9c7}.card-seo__art figcaption span{font-size:.85rem;color:#ddcba5}.card-seo__art figcaption a{color:#f2c66d}
      @media(max-width:680px){.card-seo__hero{grid-template-columns:1fr}.card-seo__image{max-height:420px}.card-seo dl{grid-template-columns:1fr}.card-seo__related-grid{grid-template-columns:1fr}.card-seo__related-card{grid-template-columns:104px minmax(0,1fr)}.card-seo__related-card-image{min-height:156px}.card-seo__related-card-image img{width:100px;height:154px}.card-seo__related-card-copy dl{grid-template-columns:repeat(3,minmax(0,1fr))}.card-seo__art img{height:320px}}
    </style>
  </head>
  <body>
    <div id="root"${options.routeStatus ? ` data-route-status="${options.routeStatus}"` : ''}>${options.body}</div>
  </body>
</html>`;
}

export function renderConstructedCardSeoDocument(options: {
  card: JsonRecord;
  format: ConstructedCardFormat;
  canonicalOrigin?: string;
  frontendAssets?: string;
}): string {
  const card = projectPublicConstructedCardSeoData(options.card, options.canonicalOrigin);
  const origin = canonicalOrigin(options.canonicalOrigin);
  const canonical = `${origin}/standard/cards/${options.format}/${card.id}/`;
  const image = safeImageUrl(card.image, origin);
  const title = `${card.name} — карта Hearthstone (${FORMAT_LABELS[options.format]}, ${card.id}) | Manacost Stats`;
  const description = descriptionForCard(card, options.format);
  const additionalProperty = [
    ['Формат', FORMAT_LABELS[options.format]],
    ['Мана', card.mana],
    ['Класс', card.className],
    ['Тип', card.type],
    ['Редкость', card.rarity],
    ['Дополнение', card.set],
    ['Атака', card.attack],
    ['Здоровье', card.health],
    ['Прочность', card.durability],
    ['Броня', card.armor],
  ].filter((entry): entry is [string, string | number] => entry[1] !== null)
    .map(([name, value]) => ({ '@type': 'PropertyValue', name, value }));
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CreativeWork',
        '@id': `${canonical}#card`,
        url: canonical,
        name: card.name,
        ...(card.englishName ? { alternateName: card.englishName } : {}),
        identifier: card.id,
        image,
        description,
        inLanguage: 'ru',
        isPartOf: { '@type': 'VideoGame', name: 'Hearthstone' },
        additionalProperty,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Карты Hearthstone', item: `${origin}/standard/cards/${options.format}/` },
          { '@type': 'ListItem', position: 3, name: card.name, item: canonical },
        ],
      },
    ],
  };
  const body = `<main class="card-seo">
      <nav aria-label="Хлебные крошки"><a href="/standard/cards/${options.format}/">Карты Hearthstone</a> / ${escapeHtml(FORMAT_LABELS[options.format])}</nav>
      <article class="card-seo__hero">
        <img class="card-seo__image" src="${escapeHtml(image)}" alt="Карта Hearthstone «${escapeHtml(card.name)}»">
        <div>
          <p>${escapeHtml(FORMAT_LABELS[options.format])}</p>
          <h1>${escapeHtml(card.name)}</h1>
          ${card.englishName && card.englishName !== card.name ? `<p lang="en">${escapeHtml(card.englishName)}</p>` : ''}
          <dl>${renderFacts(card, options.format)}</dl>
          ${card.rulesText ? `<section class="card-seo__copy"><h2>Описание карты</h2><p>${escapeHtml(card.rulesText)}</p></section>` : ''}
          ${card.flavorText ? `<section class="card-seo__copy"><h2>Художественный текст</h2><p>${escapeHtml(card.flavorText)}</p></section>` : ''}
        </div>
      </article>
      ${renderRelatedCards(options.card, origin)}
    </main>`;
  return baseDocument({
    title,
    description,
    robots: INDEX_ROBOTS,
    canonical,
    image,
    structuredData,
    structuredDataPath: `/standard/cards/${options.format}/${card.id}`,
    body,
    frontendAssets: options.frontendAssets ?? '',
    routeStatus: '200',
  });
}

function renderNoindexDocument(options: {
  title: string;
  description: string;
  heading: string;
  message: string;
  format: ConstructedCardFormat | null;
  frontendAssets: string;
  routeStatus: '404' | '503';
}): string {
  const listing = options.format ? `/standard/cards/${options.format}/` : '/standard/cards/';
  return baseDocument({
    title: options.title,
    description: options.description,
    robots: NOINDEX_ROBOTS,
    // Error documents intentionally stay server-rendered. Loading the client
    // bundle could reclassify a syntactically valid but missing entity before
    // the authoritative catalog result is available in the browser.
    frontendAssets: '',
    routeStatus: options.routeStatus,
    body: `<main class="card-seo"><h1>${escapeHtml(options.heading)}</h1><p>${escapeHtml(options.message)}</p><p><a href="${listing}">Вернуться в библиотеку карт</a></p></main>`,
  });
}

function sendHtml(response: Response, status: number, robots: string, html: string): Response {
  response.status(status);
  response.set('Content-Type', 'text/html; charset=utf-8');
  response.set('X-Robots-Tag', robots);
  response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response.send(html);
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Constructed-card catalog deadline exceeded')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createConstructedCardSeoRouter(dependencies: ConstructedCardSeoRouterDependencies): Router {
  const router = Router({ caseSensitive: true, strict: true });
  const origin = canonicalOrigin(dependencies.canonicalOrigin);
  const frontendAssets = dependencies.frontendAssets ?? '';
  const catalogTimeoutMs = Math.max(1, Math.min(25_000, Math.floor(dependencies.catalogTimeoutMs ?? 25_000)));
  const retryAfterSeconds = Math.max(1, Math.floor(dependencies.retryAfterSeconds ?? 300));

  const handler: RequestHandler = async (request, response) => {
    const startedAt = Date.now();
    const rawFormat = String(request.params.format ?? '');
    const cardId = String(request.params.cardId ?? '');
    const format = rawFormat === 'standard' || rawFormat === 'wild' ? rawFormat : null;
    if (!format || !/^[A-Za-z0-9_]{2,80}$/.test(cardId)) {
      const html = renderNoindexDocument({
        title: 'Карта не найдена | Manacost Stats',
        description: 'Запрошенная карта Hearthstone не найдена.',
        heading: 'Карта не найдена',
        message: 'Проверьте адрес или вернитесь в библиотеку карт.',
        format,
        frontendAssets,
        routeStatus: '404',
      });
      return sendHtml(response, 404, NOINDEX_ROBOTS, html);
    }

    try {
      const collection = await withDeadline(dependencies.loadCards(format), catalogTimeoutMs);
      if (!collection || !Array.isArray(collection.cards) || collection.cards.length === 0) {
        throw new Error('Invalid or empty constructed-card catalog');
      }
      const matches = collection.cards.filter(candidate => String(candidate?.card_id ?? '') === cardId);
      const card = matches.length === 1 ? matches[0] : null;
      if (!card || !isIndexableConstructedCard(card)) {
        if (collection.dataStatus !== 'fresh' || collection.cacheSource !== 'fresh') {
          throw new Error('Stale constructed-card catalog cannot authoritatively confirm entity absence');
        }
        const html = renderNoindexDocument({
          title: 'Карта не найдена | Manacost Stats',
          description: 'Запрошенная карта Hearthstone не найдена.',
          heading: 'Карта не найдена',
          message: 'Такой карты нет в текущем каталоге выбранного формата.',
          format,
          frontendAssets,
          routeStatus: '404',
        });
        return sendHtml(response, 404, NOINDEX_ROBOTS, html);
      }
      const remainingMs = Math.max(1, catalogTimeoutMs - (Date.now() - startedAt));
      const detail = await withDeadline(dependencies.loadCardDetail(format, cardId), remainingMs);
      const publicCard = detail?.card && isIndexableConstructedCard(detail.card)
        ? detail.card
        : card;
      return sendHtml(response, 200, INDEX_ROBOTS, renderConstructedCardSeoDocument({
        card: publicCard,
        format,
        canonicalOrigin: origin,
        frontendAssets,
      }));
    } catch (error) {
      dependencies.onError?.(error);
      response.set('Retry-After', String(retryAfterSeconds));
      const html = renderNoindexDocument({
        title: 'Библиотека карт временно недоступна | Manacost Stats',
        description: 'Каталог карт Hearthstone временно недоступен. Попробуйте открыть страницу позже.',
        heading: 'Библиотека карт временно недоступна',
        message: 'Мы не смогли проверить карточный каталог. Попробуйте снова через несколько минут.',
        format,
        frontendAssets,
        routeStatus: '503',
      });
      return sendHtml(response, 503, NOINDEX_ROBOTS, html);
    }
  };

  router.get('/standard/cards/:format/:cardId/', handler);
  return router;
}
