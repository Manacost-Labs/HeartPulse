import { useMemo, useState } from 'react';
import { SegmentedControl } from '../../vendor/varylo-ui/navigation/SegmentedControl';
import {
  CombatSparkline,
  HERO_MIN_GAMES,
  PlacementBars,
  RatingTimeline,
  VsGlobal,
  cardImageUrl,
  formatNumber,
  formatPercent,
  formatSigned,
  heroPickRate,
  placementShares,
  visibleHeroes,
  type BattlegroundsStats,
  type GlobalMmrFilter,
  type HeroStats,
  type ProfileStatsText,
} from '../../modules/playerStats/public';
import { RecentBattlegroundsGames } from './RecentGamesBlock';
import { GlobalNote, StatsBlock } from './StatsBlock';

const MMR_OPTIONS: Array<{ value: GlobalMmrFilter; label: string }> = [
  { value: 'TOP_50_PERCENT', label: 'Топ 50%' },
  { value: 'TOP_20_PERCENT', label: 'Топ 20%' },
  { value: 'TOP_5_PERCENT', label: 'Топ 5%' },
  { value: 'TOP_1_PERCENT', label: 'Топ 1%' },
];

/** Share of games per place as labelled columns; the top half is the player's red, the rest muted. */
function PlacementChart({ counts, average, text }: { counts: number[]; average: number | null; text: ProfileStatsText }) {
  const shares = placementShares(counts);
  const peak = Math.max(1, ...shares.map(item => item.share));
  return (
    <figure className="profile-places" aria-label={`${text.placements}: ${shares.map(item => `${item.place}-е ${formatPercent(item.share)}`).join(', ')}`}>
      <ol className="profile-places__bars" style={{ gridTemplateColumns: `repeat(${shares.length}, minmax(0, 1fr))` }}>
        {shares.map(item => (
          <li key={item.place} data-top={item.top || undefined} aria-hidden="true">
            <span className="profile-places__share">{formatNumber(item.share, 0)}%</span>
            <span className="profile-places__bar" style={{ blockSize: `${Math.max(2, (item.share / peak) * 100)}%` }} />
            <span className="profile-places__place">{item.place}</span>
          </li>
        ))}
      </ol>
      {average !== null ? (
        <figcaption>{text.averagePlace}: <strong>{formatNumber(average, 2)}</strong></figcaption>
      ) : null}
    </figure>
  );
}

function HeroRow({ hero, stats }: { hero: HeroStats; stats: BattlegroundsStats }) {
  const name = stats.cards[hero.heroCardId] ?? hero.heroCardId;
  const withGlobal = stats.global.availability === 'available';
  const pick = heroPickRate(hero);
  return (
    <li className="profile-hero">
      <span className="profile-hero__portrait"><img src={cardImageUrl(hero.heroCardId)} alt="" width="56" height="56" loading="lazy" decoding="async" /></span>
      <span className="profile-hero__name"><strong>{name}</strong><small>{hero.games} игр{pick !== null ? ` · выбор ${formatPercent(pick)}` : ''}</small></span>
      <span className="profile-hero__metric profile-hero__metric--average">
        <small>Среднее место</small>
        <strong>{formatNumber(hero.averagePlacement, 2)}</strong>
        <VsGlobal own={hero.averagePlacement} global={hero.global?.averagePlacement ?? null} digits={2} lowerIsBetter />
      </span>
      <span className="profile-hero__metric profile-hero__metric--rating">
        <small>Рейтинг</small>
        <strong data-tone={hero.netRating ? Math.sign(hero.netRating) : undefined}>{formatSigned(hero.netRating)}</strong>
      </span>
      <span className="profile-hero__places">
        <PlacementBars compact counts={hero.placements} label={`Места на ${name}`}
          global={withGlobal ? hero.global?.placementPercent ?? null : null} />
      </span>
      <span className="profile-hero__combat">
        <CombatSparkline own={hero.combat} global={withGlobal ? hero.global?.combat ?? null : null} label={`Победы в боях на ${name}`} />
      </span>
    </li>
  );
}

/** Battlegrounds under the header numbers: placements, the rating line, heroes and the latest games. */
export function BattlegroundsStatsView({ stats, mmr, onMmrChange, text }: {
  stats: BattlegroundsStats;
  mmr: GlobalMmrFilter;
  onMmrChange: (value: GlobalMmrFilter) => void;
  text: ProfileStatsText;
}) {
  const [minGames, setMinGames] = useState<number>(3);
  const heroes = useMemo(() => visibleHeroes(stats.heroes, minGames), [stats.heroes, minGames]);
  const { summary } = stats;
  return (
    <>
      <div className="player-stats-pair" data-balance="places">
        <StatsBlock title={text.placements}>
          <PlacementChart counts={summary.placements} average={summary.averagePlacement} text={text} />
        </StatsBlock>
        {stats.ratingSeries.length > 1 ? (
          <StatsBlock title={text.rating}><RatingTimeline points={stats.ratingSeries} names={stats.cards} /></StatsBlock>
        ) : null}
      </div>
      <StatsBlock title={text.heroes} wide aside={(
        <>
          {stats.global.availability === 'available' ? (
            <SegmentedControl aria-label="Сравнивать с игроками" size="sm" value={mmr}
              onValueChange={value => onMmrChange(value as GlobalMmrFilter)} options={MMR_OPTIONS} />
          ) : null}
          <SegmentedControl aria-label={text.minGames} size="sm" value={String(minGames)}
            onValueChange={value => setMinGames(Number(value))}
            options={HERO_MIN_GAMES.map(value => ({ value: String(value), label: text.gamesPlus(value) }))} />
        </>
      )}>
        <GlobalNote availability={stats.global.availability} section="battlegrounds" />
        {heroes.length
          ? <ol className="profile-heroes">{heroes.map(hero => <HeroRow key={hero.heroCardId} hero={hero} stats={stats} />)}</ol>
          : <p className="player-stats-note">{text.noHeroes(minGames)}</p>}
      </StatsBlock>
      <RecentBattlegroundsGames games={stats.recentGames} names={stats.cards} text={text} />
    </>
  );
}
