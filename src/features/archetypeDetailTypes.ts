import type { ConstructedAnalysis } from './ConstructedArchetypeAnalysis';
import type { StandardMetaPeriod } from '../../shared/standardMetaPeriods';
import type { ArchetypeClass, ArchetypeFormat } from './constructedArchetypeCatalogUrl';

export type ArchetypeBuild = {
  deckCode: string;
  games: number | null;
  winrate: number | null;
  sourceUrl: string;
  updatedAt: string | null;
  classKey: ArchetypeClass | null;
  sampleRank: string;
  samplePeriod: string;
  sampleSource?: 'stats' | 'replays';
};

export type ArchetypeItem = {
  slug: string;
  archetype: string;
  archetypeLabel: string;
  translated: boolean;
  classKey: ArchetypeClass | null;
  format: ArchetypeFormat;
  games: number;
  winrate: number | null;
  popularity: number | null;
  turns: number | null;
  durationMinutes: number | null;
  climbingSpeed: number | null;
  deckCount: number;
  builds: ArchetypeBuild[];
  sourceUrl: string;
};

export type ArchetypeCatalog = {
  format: ArchetypeFormat;
  formatLabel: string;
  patch: string;
  /** HSGuru period of the catalog; null from a source (or a cached page) that does not name it. */
  period?: StandardMetaPeriod | null;
  minimumGames: number;
  updatedAt: string | null;
  coverage: Record<string, unknown>;
  items: ArchetypeItem[];
};

export type HistoryPoint = {
  recordedAt: string;
  games: number;
  winrate: number | null;
  popularity: number | null;
  turns: number | null;
  durationMinutes: number | null;
  climbingSpeed: number | null;
  /** HSGuru period of the slice: games and rates accumulate inside it and restart at the next one. */
  patch?: string | null;
};

export type ArchetypeDetail = Omit<ArchetypeCatalog, 'coverage' | 'items'> & {
  item: ArchetypeItem;
  history: HistoryPoint[];
  analysis: ConstructedAnalysis | null;
  featuredBuild?: Pick<ArchetypeBuild, 'games' | 'winrate' | 'updatedAt' | 'sampleRank' | 'samplePeriod'> | null;
};

