export type SupplementalViciousGoldBuild = {
  deckCode: string;
  matchedArchetype: string;
  source: 'vicious_syndicate_decks' | 'hsguru_decks';
  sourceUrl: string;
  updatedAt: string;
};

const SUPPLEMENTAL_VICIOUS_GOLD_BUILDS: Record<string, SupplementalViciousGoldBuild> = {
  // Vicious Syndicate publishes this exact list under the longer “Prepared”
  // title, while its live dashboard exposes the archetype as Soothsayer Priest.
  'soothsayer priest': {
    deckCode: 'AAECAa0GBMODB6iWB/bJB6jfBw2g+waFhgfFlAfjrQfSrwebvwf6vweyxQevyQewyQfK3QeT3wew3wcAAA==',
    matchedArchetype: 'Prepared Soothsayer Priest',
    source: 'vicious_syndicate_decks',
    sourceUrl: 'https://www.vicioussyndicate.com/decks/prepared-soothsayer-priest/',
    updatedAt: '2026-07-04T00:00:00.000Z',
  },
  // The live Vicious dashboard currently calls this package “Blood Warrior”,
  // while HSGuru exposes the concrete list without that aggregate title. Keep
  // the verified current build attached to the dashboard archetype instead of
  // falling back to an unrelated Warrior list.
  'blood warrior': {
    deckCode: 'AAECAQcIn58Ew4MHm6UHnaUHnqUHm8IH69YHstgHC4agBI7UBJzUBKWFB+iHB9WmB/yvB4+xB9CyB5XCB5zCBwAA',
    matchedArchetype: 'Blood Warrior',
    source: 'hsguru_decks',
    sourceUrl: 'https://www.hsguru.com/deck/40859149',
    updatedAt: '2026-07-15T00:00:00.000Z',
  },
};

function normalizeArchetype(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function findSupplementalViciousGoldBuild(archetype: string): SupplementalViciousGoldBuild | null {
  const build = SUPPLEMENTAL_VICIOUS_GOLD_BUILDS[normalizeArchetype(archetype)];
  return build ? { ...build } : null;
}
