import type { BattlegroundHeroTierSection } from './heroCatalog';
import { preferredBattlegroundHeroImage } from './heroImagePolicy';

const HERO_TIER_ORDER = ['S', 'A', 'B', 'C', 'D'] as const;
const MINIMUM_REFERENCE_SIZE = 20;
const MINIMUM_CURRENT_RATIO = 0.75;

type LegacyHeroTierSection = BattlegroundHeroTierSection & {
  heroes: Array<BattlegroundHeroTierSection['heroes'][number] & {
    englishName?: string;
    cardId?: string;
  }>;
};

type JsonRecord = Record<string, unknown>;

type HeroRosterEvidence = {
  currentCount: number;
  fallbackCount: number;
  minimumCount: number;
};

export type BattlegroundHeroRosterResolution = HeroRosterEvidence & (
  | { status: 'accepted'; tiers: LegacyHeroTierSection[] }
  | {
      status: 'fallback';
      reason: 'empty-current' | 'below-reference-threshold';
      tiers: BattlegroundHeroTierSection[];
    }
);

export type BattlegroundHeroRosterResolverInput = {
  statsPayload: unknown;
  libraryPayload: unknown;
  fallbackSections: BattlegroundHeroTierSection[];
  publicResourceUrl: (value: unknown) => string;
};

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function normalizedHeroName(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCurrentHeroTiers(
  statsPayload: unknown,
  libraryPayload: unknown,
  fallback: BattlegroundHeroTierSection[],
  publicResourceUrl: (value: unknown) => string,
): LegacyHeroTierSection[] {
  const statsRoot = record(statsPayload);
  const view = record(statsRoot.view);
  const statsHeroes: unknown[] = Array.isArray(statsRoot.heroes)
    ? statsRoot.heroes
    : (Array.isArray(view.heroes) ? view.heroes : []);
  const libraryRoot = record(libraryPayload);
  const libraryByDbfId = new Map<number, JsonRecord>();

  (Array.isArray(libraryRoot.data) ? libraryRoot.data : []).forEach((value: unknown) => {
    const hero = record(value);
    const dbfId = Number(hero.dbf ?? hero.dbfId);
    if (Number.isFinite(dbfId)) libraryByDbfId.set(dbfId, hero);
  });

  const fallbackByName = new Map<string, BattlegroundHeroTierSection['heroes'][number]>();
  fallback.forEach(section => {
    (Array.isArray(section?.heroes) ? section.heroes : []).forEach(hero => {
      const key = normalizedHeroName(hero?.name);
      if (key) fallbackByName.set(key, hero);
    });
  });

  const heroesByTier = new Map<string, LegacyHeroTierSection['heroes']>(
    HERO_TIER_ORDER.map(tier => [tier, []]),
  );

  statsHeroes.forEach(value => {
    const hero = record(value);
    const dbfId = Number(hero.dbfId ?? hero.dbf ?? hero.dbf_id);
    const libraryHero = Number.isFinite(dbfId) ? libraryByDbfId.get(dbfId) : undefined;
    const libraryName = record(libraryHero?.name);
    const name = String(libraryName.ru || hero.hero || hero.name || '').trim();
    if (!name) return;

    const tierValue = String(hero.tier || 'D').trim().toUpperCase();
    const tier = HERO_TIER_ORDER.includes(tierValue as typeof HERO_TIER_ORDER[number])
      ? tierValue
      : 'D';
    const englishName = String(libraryName.en || hero.englishName || '').trim();
    const cardId = String(libraryHero?.card_id || hero.cardId || hero.card_id || '').trim();
    const fallbackHero = fallbackByName.get(normalizedHeroName(name));
    const heroImages = record(hero.images);
    const libraryImages = record(libraryHero?.images);
    const image = publicResourceUrl(preferredBattlegroundHeroImage({
      cardId,
      dbfId,
      apiImage: hero.image,
      apiNestedImage: heroImages.hero,
      libraryImage: libraryImages.hero,
      legacyImage: fallbackHero?.image,
      fallback: '',
    }));

    heroesByTier.get(tier)?.push({
      name,
      englishName,
      popularity: hero.pick_rate == null ? '' : String(hero.pick_rate),
      averagePlace: hero.avg_placement == null ? '' : String(hero.avg_placement),
      image,
      dbfId: Number.isFinite(dbfId) ? dbfId : undefined,
      cardId,
    });
  });

  return HERO_TIER_ORDER.flatMap(tier => {
    const heroes = heroesByTier.get(tier) ?? [];
    heroes.sort((left, right) => (
      Number.parseFloat(String(left.averagePlace || '99').replace(',', '.'))
      - Number.parseFloat(String(right.averagePlace || '99').replace(',', '.'))
    ));
    return heroes.length ? [{ tier, title: `${tier} Тир`, heroes }] : [];
  });
}

function heroCount(sections: BattlegroundHeroTierSection[]): number {
  return sections.reduce(
    (total, section) => total + (Array.isArray(section?.heroes) ? section.heroes.length : 0),
    0,
  );
}

export function resolveBattlegroundHeroRoster({
  statsPayload,
  libraryPayload,
  fallbackSections,
  publicResourceUrl,
}: BattlegroundHeroRosterResolverInput): BattlegroundHeroRosterResolution {
  const fallback = Array.isArray(fallbackSections) ? fallbackSections : [];
  const current = normalizeCurrentHeroTiers(
    statsPayload,
    libraryPayload,
    fallback,
    publicResourceUrl,
  );
  const fallbackCount = heroCount(fallback);
  const currentCount = heroCount(current);
  const minimumCount = fallbackCount >= MINIMUM_REFERENCE_SIZE
    ? Math.ceil(fallbackCount * MINIMUM_CURRENT_RATIO)
    : 1;
  const evidence = { currentCount, fallbackCount, minimumCount };

  if (!currentCount) {
    return { ...evidence, status: 'fallback', reason: 'empty-current', tiers: fallback };
  }
  if (currentCount < minimumCount) {
    return {
      ...evidence,
      status: 'fallback',
      reason: 'below-reference-threshold',
      tiers: fallback,
    };
  }
  return { ...evidence, status: 'accepted', tiers: current };
}
