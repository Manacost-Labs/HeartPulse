import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../../vendor/valyro-ui/data-display/DataTable';
import { KpiGroup } from '../../vendor/valyro-ui/data-display/KpiGroup';
import { SegmentedControl } from '../../vendor/valyro-ui/navigation/SegmentedControl';
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
  pluralGames,
  visibleHeroes,
  type BattlegroundsStats,
  type GlobalMmrFilter,
  type HeroStats,
} from '../../modules/playerStats/public';
import { DATA_TABLE_LABELS, KPI_LABELS } from './playerStatsLabels';
import { GlobalNote, StatsBlock } from './StatsBlock';

const MMR_OPTIONS: Array<{ value: GlobalMmrFilter; label: string }> = [
  { value: 'TOP_50_PERCENT', label: 'Топ 50%' },
  { value: 'TOP_20_PERCENT', label: 'Топ 20%' },
  { value: 'TOP_5_PERCENT', label: 'Топ 5%' },
  { value: 'TOP_1_PERCENT', label: 'Топ 1%' },
];

function heroColumns(stats: BattlegroundsStats): DataTableColumn<HeroStats>[] {
  const name = (hero: HeroStats) => stats.cards[hero.heroCardId] ?? hero.heroCardId;
  const withGlobal = stats.global.availability === 'available';
  return [
    { key: 'hero', header: 'Герой', accessor: name, sortable: true, cell: hero => (
      <span className="player-stats-hero">
        <span className="player-stats-hero__art"><img src={cardImageUrl(hero.heroCardId)} alt="" decoding="async" /></span>
        <span><strong>{name(hero)}</strong><small>{pluralGames(hero.games)}</small></span>
      </span>
    ) },
    { key: 'netRating', header: 'Рейтинг', align: 'right', sortable: true, accessor: hero => hero.netRating ?? -Infinity,
      cell: hero => <span data-tone={hero.netRating === null ? undefined : hero.netRating >= 0 ? 'better' : 'worse'}
        className="player-stats-signed">{formatSigned(hero.netRating)}</span> },
    { key: 'combat', header: withGlobal ? 'Бои по ходам: вы / все' : 'Бои по ходам', cell: hero => (
      <CombatSparkline own={hero.combat} global={withGlobal ? hero.global?.combat ?? null : null}
        label={`Победы в боях на ${name(hero)}`} />
    ) },
    { key: 'placements', header: 'Места', cell: hero => (
      <PlacementBars compact counts={hero.placements} label={`Места на ${name(hero)}`}
        global={withGlobal ? hero.global?.placementPercent ?? null : null} />
    ) },
    { key: 'averagePlacement', header: 'Среднее место', align: 'right', sortable: true, cell: hero => (
      <span className="player-stats-metric">
        <strong>{formatNumber(hero.averagePlacement, 2)}</strong>
        <VsGlobal own={hero.averagePlacement} global={hero.global?.averagePlacement ?? null} digits={2} lowerIsBetter />
      </span>
    ) },
    { key: 'pickRate', header: 'Выбор', align: 'right', sortable: true, accessor: hero => heroPickRate(hero) ?? -1, cell: hero => (
      <span className="player-stats-metric">
        <strong>{formatPercent(heroPickRate(hero))}</strong>
        <VsGlobal own={heroPickRate(hero)} global={hero.global?.pickRatePercent ?? null} unit="%" />
      </span>
    ) },
  ];
}

/** HSReplay «My Stats» for Battlegrounds: header numbers, rating line, hero performance. */
export function BattlegroundsStatsView({ stats, mmr, onMmrChange }: {
  stats: BattlegroundsStats;
  mmr: GlobalMmrFilter;
  onMmrChange: (value: GlobalMmrFilter) => void;
}) {
  const [minGames, setMinGames] = useState<number>(3);
  const heroes = useMemo(() => visibleHeroes(stats.heroes, minGames), [stats.heroes, minGames]);
  const columns = useMemo(() => heroColumns(stats), [stats]);
  const { summary } = stats;
  return (
    <>
      <div className="player-stats-summary">
        <KpiGroup locale="ru-RU" labels={KPI_LABELS} minTileWidth={150} items={[
          { id: 'rating', label: 'Лучший рейтинг', value: summary.highestRating,
            caption: summary.currentRating !== null ? `сейчас ${formatNumber(summary.currentRating)}` : undefined },
          { id: 'placement', label: 'Среднее место', value: summary.averagePlacement, format: { maximumFractionDigits: 2 },
            caption: summary.top4Rate !== null ? `в топ-${stats.duos ? 2 : 4}: ${formatPercent(summary.top4Rate)}` : undefined },
          { id: 'games', label: 'Игр', value: stats.games, caption: `первых мест: ${formatNumber(summary.firstPlaces)}` },
          { id: 'time', label: 'Время в игре', value: Math.round(summary.timePlayedSeconds / 360) / 10,
            format: { style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 1 } },
        ]} />
        <PlacementBars counts={summary.placements} average={summary.averagePlacement} label="Места за период" />
      </div>
      {stats.ratingSeries.length > 1 ? (
        <StatsBlock title="Рейтинг по играм">
          <RatingTimeline points={stats.ratingSeries} names={stats.cards} />
        </StatsBlock>
      ) : null}
      <StatsBlock title="Герои" aside={(
        <>
          {stats.global.availability === 'available' ? (
            <SegmentedControl aria-label="Сравнивать с игроками" size="sm" value={mmr}
              onValueChange={value => onMmrChange(value as GlobalMmrFilter)} options={MMR_OPTIONS} />
          ) : null}
          <SegmentedControl aria-label="Минимум игр на герое" size="sm" value={String(minGames)}
            onValueChange={value => setMinGames(Number(value))}
            options={HERO_MIN_GAMES.map(value => ({ value: String(value), label: `${value}+ игр` }))} />
        </>
      )}>
        <GlobalNote availability={stats.global.availability} section="battlegrounds" />
        <DataTable label="Герои" data={heroes} columns={columns} getRowId={hero => hero.heroCardId}
          density="compact" locale="ru-RU" labels={DATA_TABLE_LABELS} pageSize={20}
          empty={`Нет героев с ${minGames} и более играми`} />
      </StatsBlock>
    </>
  );
}
