import type { ConstructedCardStat } from './ConstructedArchetypeCardStats';
import { HsguruArchetypeStats } from './HsguruArchetypeStats';
import './ConstructedArchetypeAnalysis.css';

export type { ConstructedCardStat };

export type ArchetypeClass =
  | 'deathknight'
  | 'demonhunter'
  | 'druid'
  | 'hunter'
  | 'mage'
  | 'paladin'
  | 'priest'
  | 'rogue'
  | 'shaman'
  | 'warlock'
  | 'warrior';

export type ConstructedClassMatchup = {
  classKey: ArchetypeClass;
  classLabel: string;
  winrate: number;
  games: number;
  share: number | null;
};

export type ConstructedAnalysis = {
  rank: 'legend';
  period: 'past_week';
  state: 'ok' | 'partial' | 'error';
  updatedAt: string | null;
  matchupsUpdatedAt: string | null;
  cardStatsUpdatedAt: string | null;
  sourceUrls: {
    matchups: string;
    cards: string;
  };
  classMatchups: ConstructedClassMatchup[];
  cardStats: ConstructedCardStat[];
};

/**
 * The analysis chunk: HSGuru's full mulligan and class matchups by slice, with
 * the older Legend · week analysis as the fallback while a slice is collected.
 */
export default function ConstructedArchetypeAnalysis({ analysis, format, slug }: {
  analysis: ConstructedAnalysis | null;
  format: 'standard' | 'wild';
  slug: string;
}) {
  return <HsguruArchetypeStats format={format} slug={slug} legacy={analysis} />;
}

export { ArchetypeAnalysisSkeleton } from './ConstructedArchetypeAnalysisSkeleton';
