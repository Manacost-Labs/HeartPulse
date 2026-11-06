import { SegmentedControl } from '../../vendor/varylo-ui/navigation/SegmentedControl';
import {
  summaryItems,
  type PlayerStats,
  type PlayerStatsMode,
  type ProfileStatsText,
  type StatsPeriod,
} from '../../modules/playerStats/public';

const PERIODS: StatsPeriod[] = ['all', 'season', '90', '30', '7'];
const SKELETON_ITEMS = 4;

export type StatsFilters = {
  modes: PlayerStatsMode[];
  mode: PlayerStatsMode;
  period: StatsPeriod;
  duos: boolean;
  onMode: (mode: PlayerStatsMode) => void;
  onPeriod: (period: StatsPeriod) => void;
  onDuos: (duos: boolean) => void;
};

/**
 * The header strip of the statistics: mode, period and the four numbers of
 * the shown mode. It is the only switch of the section, so the mode views
 * below have no tabs or filters of their own. While nothing is loaded the
 * numbers keep their height, so the page does not jump.
 */
export function StatsSummary({ stats, filters, text, busy, className }: {
  className?: string;
  stats: PlayerStats | null;
  filters: StatsFilters;
  text: ProfileStatsText;
  busy: boolean;
}) {
  const items = stats && stats.games > 0 ? summaryItems(stats, text) : null;
  return (
    <div className={`profile-stats-summary${className ? ` ${className}` : ''}`} aria-busy={busy || undefined}>
      <div className="profile-stats-summary__controls">
        {filters.modes.length > 1 ? (
          <SegmentedControl aria-label={text.mode} size="sm" value={filters.mode}
            onValueChange={value => filters.onMode(value as PlayerStatsMode)}
            options={filters.modes.map(mode => ({ value: mode, label: text.modeNames[mode] }))} />
        ) : null}
        {filters.mode === 'battlegrounds' ? (
          <SegmentedControl aria-label={text.format} size="sm" value={filters.duos ? 'duos' : 'solo'}
            onValueChange={value => filters.onDuos(value === 'duos')}
            options={[{ value: 'solo', label: text.solo }, { value: 'duos', label: text.duos }]} />
        ) : null}
        <SegmentedControl aria-label={text.period} size="sm" value={filters.period}
          onValueChange={value => filters.onPeriod(value as StatsPeriod)}
          options={PERIODS.map(period => ({ value: period, label: text.periodNames[period] }))} />
      </div>
      {items === null && stats ? null : (
        <dl className="profile-stats-summary__numbers">
          {(items ?? Array.from({ length: SKELETON_ITEMS }, () => null)).map((item, index) => (
            item ? (
              <div key={item.id} className="profile-stats-summary__item">
                <dt>{item.label}</dt>
                <dd>
                  <span className="profile-stats-summary__value" data-tone={item.tone ? Math.sign(item.tone) : undefined}>{item.value}</span>
                  {item.caption ? <span className="profile-stats-summary__caption">{item.caption}</span> : null}
                </dd>
              </div>
            ) : (
              <div key={index} className="profile-stats-summary__item" data-skeleton="">
                <dt><span /></dt>
                <dd><span className="profile-stats-summary__value"><span /></span></dd>
              </div>
            )
          ))}
        </dl>
      )}
    </div>
  );
}
