import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './MatchupsSkeleton.css';

/** The archetype overview's outline: header, summary, tools and the first rows. */
export function MatchupsOverviewSkeleton() {
  return <div className="matchups-skeleton-overview">
    <LoadingBlock className="matchups-skeleton-hero" />
    <LoadingBlock className="matchups-skeleton-summary" />
    <div className="matchups-skeleton-tools"><LoadingBlock /><LoadingBlock /></div>
    <div className="matchups-skeleton-rows">{[0, 1, 2].map(index => <LoadingBlock key={index} />)}</div>
  </div>;
}

export function MatchupsSkeleton() {
  return <LoadingSurface label="Загружаем матчапы" quiet layout="rows" blocksClassName="matchups-skeleton-body">
    <LoadingBlock className="matchups-skeleton-view" />
    <div className="standard-matchups__picker matchups-skeleton-picker mb-4"><MatchupsOverviewSkeleton /></div>
  </LoadingSurface>;
}
