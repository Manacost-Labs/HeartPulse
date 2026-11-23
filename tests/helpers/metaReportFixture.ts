import { createMetaReportSnapshots, type MetaReportSnapshots } from '../../server/modules/metaReport/public.ts';

/*
 * Weekly meta report snapshots recorded by the real snapshot job into a real
 * `node:sqlite` file (`SCENARIOS` below). The sources answer what the open
 * projections answer a guest, plus paid fields with sentinels the snapshot
 * must drop.
 */

export const PAID_SENTINELS = ['SENTINEL_DECK_CODE', 'SENTINEL_LEGEND', '77.7701', 'SENTINEL_OFFER'];

type Archetype = [slug: string, archetype: string, label: string, winrate: number, popularity: number, games: number];

const WEEKS: Record<string, { period: string; archetypes: Archetype[] }> = {
  '2026-11-23': {
    period: 'patch_37.0.2',
    archetypes: [
      ['zoo-warlock', 'Zoo Warlock', 'Зоо Чернокнижник', 57.5, 9.8, 20000],
      ['blood-dk', 'Blood DK', 'ДК Крови', 52, 8.8, 18000],
      ['thief-priest', 'Thief Priest', 'Вор Жрец', 54.1, 4, 8000],
      ['yogg-warrior', 'Yogg Warrior', 'Йогг Воин', 59.1, 2.9, 6000],
      ['rare-rogue', 'Rare Rogue', 'Редкий Разбойник', 65, 0.4, 900],
    ],
  },
  '2026-11-30': {
    period: 'patch_37.0.2',
    archetypes: [
      ['zoo-warlock', 'Zoo Warlock', 'Зоо Чернокнижник', 56.9, 10.4, 26000],
      ['blood-dk', 'Blood DK', 'ДК Крови', 53.1, 8.1, 22000],
      ['thief-priest', 'Thief Priest', 'Вор Жрец', 54, 4.2, 10500],
      ['yogg-warrior', 'Yogg Warrior', 'Йогг Воин', 60.2, 3, 8100],
      ['big-shaman', 'Big Shaman', 'Большой Шаман', 55.5, 1.2, 3000],
      ['rare-rogue', 'Rare Rogue', 'Редкий Разбойник', 66, 0.4, 1000],
    ],
  },
  '2026-12-07': {
    period: 'patch_37.2.0',
    archetypes: [
      ['zoo-warlock', 'Zoo Warlock', 'Зоо Чернокнижник', 51, 7, 4000],
      ['blood-dk', 'Blood DK', 'ДК Крови', 55.4, 9.1, 5200],
      ['yogg-warrior', 'Yogg Warrior', 'Йогг Воин', 58, 2.5, 1500],
    ],
  },
};

// Twenty rare archetypes below 0.5 % of games: enough for a reportable meta, never in the winrate top.
const FILLER: Archetype[] = Array.from({ length: 20 }, (_, index) =>
  [`filler-${index + 1}`, `Filler ${index + 1}`, `Редкость ${index + 1}`, 45, 0.1, 120]);

/** One recorded Monday: its date, whose figures it carries and since when Arena and Battlegrounds were not refreshed. */
type Week = { date: string; figures: keyof typeof WEEKS; staleSince?: string };

/**
 * `weekly`: 23.11, 30.11 (same period) and 07.12 (new period, patch 42 h before the snapshot).
 * `gap`: 23.11 and 07.12 in one period (30.11 was not recorded); on 07.12 Arena and Battlegrounds
 * were last refreshed on 1 December, so both are stale.
 */
export const SCENARIOS: Record<'weekly' | 'gap' | 'first', Week[]> = {
  first: [{ date: '2026-11-23', figures: '2026-11-23' }],
  weekly: [{ date: '2026-11-23', figures: '2026-11-23' }, { date: '2026-11-30', figures: '2026-11-30' }, { date: '2026-12-07', figures: '2026-12-07' }],
  gap: [{ date: '2026-11-23', figures: '2026-11-23' }, { date: '2026-12-07', figures: '2026-11-30', staleSince: '2026-12-01' }],
};

const meta = ({ date, figures }: Week) => ({
  format: 'standard', formatLabel: 'Стандарт', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда', period: WEEKS[figures].period,
  currentPatchPeriod: WEEKS[figures].period, minGames: 100, totalGames: 3_298_989, source: 'hsguru', updatedAt: `${date}T00:00:00.000Z`,
  privateBreakdown: 'SENTINEL_LEGEND',
  items: [...WEEKS[figures].archetypes, ...FILLER].map(([slug, archetype, archetypeLabel, winrate, popularity, games]) => ({
    id: slug, slug, archetype, archetypeLabel, translated: true, classKey: 'warlock', winrate, popularity, games,
    turns: 77.7701, durationMinutes: null, climbingSpeed: null, deckCode: 'SENTINEL_DECK_CODE',
  })),
});

const matchups = ({ date }: Week) => ({
  format: 'standard', formatLabel: 'Стандарт', rank: 'all', rankLabel: 'Все ранги', period: 'black_empire', minGames: 25,
  totalGames: 21_210_830, source: 'hsguru', updatedAt: `${date}T02:00:00.000Z`,
  columns: [
    { name: 'Zoo Warlock', label: 'Зоо Чернокнижник', classKey: 'warlock', popularity: '9.8%', games: 2_067_342 },
    { name: 'Blood DK', label: 'ДК Крови', classKey: 'deathknight', popularity: '8.8%', games: 1_857_776 },
    { name: 'Thief Priest', label: 'Вор Жрец', classKey: 'priest', popularity: '4.0%', games: 900_000 },
  ],
  rows: [
    {
      archetype: 'Zoo Warlock', archetypeLabel: 'Зоо Чернокнижник', classKey: 'warlock', winrate: 57.5, games: 2_067_342,
      cells: [
        { opponent: 'Zoo Warlock', winrate: 50, games: 516_760 },
        { opponent: 'Blood DK', winrate: 52.9, games: 32_997 },
        { opponent: 'Thief Priest', winrate: 44.8, games: 197_688 },
        { opponent: 'Yogg Warrior', winrate: 71, games: 20 },
      ],
    },
    {
      archetype: 'Thief Priest', archetypeLabel: 'Вор Жрец', classKey: 'priest', winrate: 49.1, games: 900_000,
      cells: [{ opponent: 'Zoo Warlock', winrate: 55.2, games: 197_688 }],
    },
  ],
});

const arena = ({ date, staleSince }: Week) => ({
  updatedAt: staleSince ? `${staleSince}T03:00:00.000Z` : `${date}T03:00:00.000Z`, source: 'HSReplay', sampleUnit: 'drafts',
  classes: [
    { place: 1, id: 'death-knight', name: 'Рыцарь смерти', winrate: 52.3, sample: 1308 },
    { place: 2, id: 'hunter', name: 'Охотник', winrate: 51.7, sample: 682 },
    { place: 3, id: 'druid', name: 'Друид', winrate: 37.6, sample: 89 },
    { place: 4, id: 'demon-hunter', name: 'Охотник на демонов', winrate: 36.4, sample: 35 },
  ],
});

const heroes = ({ date, staleSince }: Week) => ({
  mode: 'solo', mmr: 'TOP_50_PERCENT', updatedAt: staleSince ? `${staleSince}T03:01:00.000Z` : `${date}T03:01:00.000Z`, source: 'HSReplay',
  heroes: [
    { dbfId: 60370, cardId: 'TB_BaconShop_HERO_53', name: 'Изера', tier: 'A', avgPlacement: 4.04, top4Rate: 57.9, pickRate: 25.69, offerRate: 'SENTINEL_OFFER' },
    { dbfId: 59807, cardId: 'TB_BaconShop_HERO_37', name: 'Лорд Джараксус', tier: 'A', avgPlacement: 3.98, top4Rate: 59.6, pickRate: 52.71 },
    { dbfId: 61000, cardId: 'TB_BaconShop_HERO_99', name: 'Безымянный', tier: 'C', avgPlacement: null, top4Rate: 40, pickRate: 1 },
  ],
});

const patches = ({ figures }: Week) => ({
  patches: [
    { version: '37.0.2', title: 'Обновление 37.0.2', official_published_at: '2026-11-03T18:00:00+00:00' },
    ...(WEEKS[figures].period === 'patch_37.2.0' ? [{ version: '37.2.0.255000', title: 'Обновление 37.2', official_published_at: '2026-12-05T12:00:00+00:00' }] : []),
  ],
});

/** Records the weeks of a scenario through the real job (Monday 06:40 UTC each) and returns the open store. */
export async function recordMetaReportWeeks(stateDirectory: string, scenario: keyof typeof SCENARIOS = 'weekly'): Promise<MetaReportSnapshots> {
  let week = SCENARIOS[scenario][0];
  const snapshots = createMetaReportSnapshots({
    stateDirectory,
    now: () => Date.parse(`${week.date}T06:40:00Z`),
    sources: {
      standard: async () => meta(week),
      matchups: async () => matchups(week),
      arena: async () => arena(week),
      battlegrounds: async () => heroes(week),
      patches: async () => patches(week),
    },
  });
  for (const next of SCENARIOS[scenario]) {
    week = next;
    const result = await snapshots.run();
    if (result !== 'recorded') throw new Error(`${week.date}: ${result}`);
  }
  return snapshots;
}

/** The open archetype catalog of now: Zoo Warlock and Yogg Warrior are indexable, Thief Priest has too few games. */
export const ARCHETYPE_CATALOG = {
  format: 'standard', formatLabel: 'Стандарт', patch: '37.2.0', period: null, minimumGames: 100, updatedAt: '2026-12-07T00:00:00.000Z',
  items: [
    ['zoo-warlock', 'Zoo Warlock', 'Зоо Чернокнижник', 20_000, 9.8, 5],
    ['yogg-warrior', 'Yogg Warrior', 'Йогг Воин', 6000, 2.9, 3],
    ['thief-priest', 'Thief Priest', 'Вор Жрец', 500, 4, 2],
  ].map(([slug, archetype, archetypeLabel, games, popularity, deckCount]) => ({
    slug, format: 'standard', classKey: 'warlock', archetype, archetypeLabel, translated: true, games, winrate: 55, popularity,
    turns: null, durationMinutes: null, climbingSpeed: null, deckCount, sourceUrl: '',
  })),
};
