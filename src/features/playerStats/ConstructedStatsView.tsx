import {
  RankTimeline,
  type ConstructedStats,
  type ProfileStatsText,
} from '../../modules/playerStats/public';
import { DeckCards } from './DeckCards';
import { MatchupHeatmap } from './MatchupHeatmap';
import { RecentConstructedGames } from './RecentGamesBlock';
import { GlobalNote, StatsBlock } from './StatsBlock';

/**
 * Standard or Wild under the header numbers: decks, the rank line, matchups
 * and the latest games. Classes, archetypes and opponents have no tables of
 * their own: the decks and the matchup grid already show every one of them.
 */
export function ConstructedStatsView({ stats, text }: { stats: ConstructedStats; text: ProfileStatsText }) {
  return (
    <>
      <GlobalNote availability={stats.global.availability} section="standard" />
      <StatsBlock title={text.decks} note={stats.decks.some(deck => (deck.results?.length ?? 0) >= 5) ? text.decksNote : undefined} wide>
        <DeckCards stats={stats} text={text} />
      </StatsBlock>
      {stats.rankSeries.length > 1 ? (
        <StatsBlock title={text.rank} wide><RankTimeline points={stats.rankSeries} /></StatsBlock>
      ) : null}
      {stats.opponentClasses.length ? (
        <StatsBlock title={text.matchups} note={text.matchupsNote} wide><MatchupHeatmap stats={stats} text={text} /></StatsBlock>
      ) : null}
      <RecentConstructedGames games={stats.recentGames} text={text} />
    </>
  );
}
