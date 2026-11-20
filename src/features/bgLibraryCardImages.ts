import type React from 'react';
import { publicResourceUrl } from '../publicResourceUrl';
import { distinctCatalogIdentity } from './bgLibraryCatalogModel';
import { cardLibraryKind, cardRuName, cleanSearch, type LibraryCard } from './bgLibraryCards';
import type { LibraryKind, PoolMode } from './bgLibrarySections';

/** The pictures of a library card: candidates in order of preference, golden versions and broken-image fallbacks. */
function isArtOnlyImage(url?: string | null): boolean {
  return Boolean(url && (/\/uploads\/art\//.test(url) || /\/v1\/orig\//.test(url)));
}

function properImage(url?: string | null): string | null {
  return url && !isArtOnlyImage(url) ? url : null;
}

export function localDbImageUrl(cardId: string, folder: 'cards' | 'framed' | 'golden' | 'art'): string {
  const ext = folder === 'art' ? 'jpg' : 'png';
  return `/api/public-resource/db/uploads/${folder}/${encodeURIComponent(cardId)}.${ext}`;
}

export function hearthstoneJsonBgCardUrl(cardId: string, size: '256x' | '512x' = '512x'): string {
  return `/api/public-resource/hsjson/v1/bgs/latest/ruRU/${size}/${encodeURIComponent(cardId)}.png`;
}

export function isLikelyGoldenCardId(cardId: string): boolean {
  return /_G($|t$)/.test(cardId);
}

function baseCardId(cardId: string): string {
  return cardId.replace(/_Gt$/, 't').replace(/_G$/, '');
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach(value => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
}

export function cardImageCandidates(card: LibraryCard, includeArt = false): string[] {
  const id = card.card_id || '';
  const baseId = baseCardId(id);
  const isGoldenId = id && isLikelyGoldenCardId(id) && baseId !== id;
  const kind = cardLibraryKind(card);
  const baseFallbacks = isGoldenId
    ? [
        localDbImageUrl(baseId, 'cards'),
        localDbImageUrl(baseId, 'framed'),
        localDbImageUrl(baseId, 'golden'),
        hearthstoneJsonBgCardUrl(baseId),
      ]
    : [];
  const anomalyFallbacks = kind === 'anomaly'
    ? [
        hearthstoneJsonBgCardUrl(id),
        hearthstoneJsonBgCardUrl(id, '256x'),
        ...['t', 't2', 't3', 't4'].flatMap(suffix => [
          localDbImageUrl(`${id}${suffix}`, 'cards'),
          localDbImageUrl(`${id}${suffix}`, 'framed'),
        ]),
      ]
    : [];
  const cropFallback = kind === 'anomaly' ? null : card.images?.crop;
  return uniqueStrings([
    ...baseFallbacks,
    ...anomalyFallbacks,
    properImage(card.images?.card),
    properImage(card.images?.framed),
    properImage(card.images?.golden),
    includeArt ? card.images?.art : null,
    includeArt ? cropFallback : null,
  ]).map(publicResourceUrl);
}

export function primaryCardImage(card: LibraryCard): string | null {
  return cardImageCandidates(card, false)[0] || null;
}

export function detailCardImage(card: LibraryCard): string | null {
  return cardImageCandidates(card, true)[0] || null;
}

export function fallbackCardImages(card: LibraryCard, current: string, includeArt = false): string[] {
  return cardImageCandidates(card, includeArt).filter(candidate => candidate !== current);
}

export function goldenCardImage(card: LibraryCard): string | null {
  const golden = properImage(card.images?.golden);
  return golden && golden !== primaryCardImage(card) ? golden : null;
}

export function goldenVariantImage(card: LibraryCard): string | null {
  return properImage(card.images?.golden)
    || (isLikelyGoldenCardId(card.card_id) ? hearthstoneJsonBgCardUrl(card.card_id) : null);
}

export function goldenVariantFallbackImages(card: LibraryCard, current: string): string[] {
  return uniqueStrings([
    properImage(card.images?.golden),
    hearthstoneJsonBgCardUrl(card.card_id),
    hearthstoneJsonBgCardUrl(card.card_id, '256x'),
  ]).filter(candidate => candidate !== current);
}

function hasReliableGolden(card: LibraryCard): boolean {
  return Boolean(card.asset_status?.local_golden || properImage(card.images?.golden));
}

function isCompanionOrBuddy(card: LibraryCard): boolean {
  const cardId = card.card_id || '';
  const text = cleanSearch([cardId, card.name?.ru, card.name?.en, card.text_ru].filter(Boolean).join(' '));
  return /buddy|companion|компаньон|напарник|tb_baconshop_hero|_hero_.*buddy|hero_.*buddy/.test(text);
}

function isGeneratedArchiveToken(card: LibraryCard): boolean {
  const cardId = card.card_id || '';
  const text = cleanSearch([cardId, card.name?.ru, card.name?.en].filter(Boolean).join(' '));
  return (
    isLikelyGoldenCardId(cardId) ||
    /(^|_)BG34_Giant_/i.test(cardId) ||
    /(^|_)magicitem_/i.test(cardId) ||
    /^TB_BaconUps_/i.test(cardId) ||
    /_HERO_/i.test(cardId) ||
    /(^|_)HERO_/i.test(cardId) ||
    /(^|_)Bacon(BloodGem|Refresh|Pass|Tooltip)(_|$)/i.test(cardId) ||
    /\btimewarped\b|хрономальн/.test(text) ||
    /\bbacon blood gem\b|\bbacon pass tooltip\b|\bbacon refresh\b|кровавые самоцветы|передача карт|обновление таверны/.test(text) ||
    /(?:^|_)BG[^_]*_[A-Z0-9]+t\d*$/i.test(cardId) ||
    /(?:^|_)BGS?_[A-Z0-9]+t\d*$/i.test(cardId) ||
    /(?:^|_)TB_[A-Za-z0-9]+_[A-Za-z0-9]+t\d*$/i.test(cardId)
  );
}

export function isArchiveDisplayCard(card: LibraryCard, kind: LibraryKind, pool: PoolMode): boolean {
  if (pool !== 'archive' || kind !== 'minion') return true;
  if (isCompanionOrBuddy(card)) return false;
  if (isGeneratedArchiveToken(card)) return false;
  return hasReliableGolden(card);
}

export function hideBrokenImage(event: React.SyntheticEvent<HTMLImageElement>): void {
  event.currentTarget.style.display = 'none';
}

export function fallbackBrokenHeroImage(event: React.SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  const fallbacks = (image.dataset.fallbacks || '').split('|').filter(Boolean);
  const index = Number(image.dataset.fallbackIndex || 0);
  const fallback = fallbacks[index];
  if (fallback) {
    image.dataset.fallbackIndex = String(index + 1);
    image.src = fallback;
    return;
  }
  if (image.dataset.logoFallbackTried !== 'true') {
    image.dataset.logoFallbackTried = 'true';
    image.src = '/arena-logo-icon.webp?v=arena-legacy-20260629';
    return;
  }
  image.style.display = 'none';
}

function cardFamilyKey(card: LibraryCard): string {
  const kind = cardLibraryKind(card);
  const distinctIdentity = distinctCatalogIdentity(kind, card);
  if (distinctIdentity) return distinctIdentity;
  return [
    kind,
    card.card_type?.slug || '',
    cleanSearch(cardRuName(card) || card.name?.en || card.card_id),
    cleanSearch(card.name?.en || ''),
    card.tavern_tier || 'none',
    card.creature_type?.slug || card.group?.slug || 'none',
  ].join('|');
}

function cardQualityScore(card: LibraryCard): number {
  const cardId = cleanSearch(card.card_id || '');
  const isLikelyGolden = cardId.includes('_g') || cardId.includes('golden');
  const statTotal = Number(card.attack || 0) + Number(card.health || 0);
  return (
    (card.in_pool ? 1000 : 0) +
    (primaryCardImage(card) ? 300 : 0) +
    (card.images?.card ? 60 : 0) +
    (goldenCardImage(card) ? 30 : 0) +
    (isLikelyGolden ? 0 : 25) -
    Math.max(0, statTotal) * 0.02
  );
}

export function dedupeLibraryCards(cards: LibraryCard[]): LibraryCard[] {
  const byFamily = new Map<string, LibraryCard>();
  cards.forEach(card => {
    if (!card?.dbf) return;
    const key = cardFamilyKey(card);
    const current = byFamily.get(key);
    if (!current || cardQualityScore(card) > cardQualityScore(current)) {
      byFamily.set(key, card);
    }
  });
  return Array.from(byFamily.values());
}
