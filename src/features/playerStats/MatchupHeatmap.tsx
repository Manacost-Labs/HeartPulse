import {
  CLASS_LABELS,
  classIconUrl,
  formatPercent,
  matchupHeatmap,
  transposeHeatmap,
  type ConstructedStats,
  type HeatCell,
  type ProfileStatsText,
} from '../../modules/playerStats/public';

type HearthstoneClass = ConstructedStats['classes'][number]['playerClass'];

function ClassIcon({ playerClass, size }: { playerClass: HearthstoneClass; size: number }) {
  return <img src={classIconUrl(playerClass)} alt="" width={size} height={size} loading="lazy" decoding="async" />;
}

/** A class as a column heading: the icon, its name for screen readers and on hover. */
function IconHeading({ playerClass }: { playerClass: HearthstoneClass }) {
  return (
    <th scope="col" title={CLASS_LABELS[playerClass]}>
      <span className="profile-heat__icon"><ClassIcon playerClass={playerClass} size={28} /></span>
      <span className="player-stats-visually-hidden">{CLASS_LABELS[playerClass]}</span>
    </th>
  );
}

function RowHeading({ playerClass, label }: { playerClass: HearthstoneClass | 'all'; label: string }) {
  return (
    <th scope="row" data-total={playerClass === 'all' || undefined}>
      <span className="profile-heat__name">{playerClass === 'all' ? null : <ClassIcon playerClass={playerClass} size={24} />}<span>{label}</span></span>
    </th>
  );
}

function Cell({ cell, title, empty, total }: { cell: HeatCell; title: string; empty: string; total?: boolean }) {
  if (cell.games === 0) {
    return <td className="profile-heat__cell" data-empty=""><span aria-hidden="true">·</span><span className="player-stats-visually-hidden">{empty}</span></td>;
  }
  return (
    <td className="profile-heat__cell" data-tone={cell.tone || undefined} data-low={cell.low || undefined} data-total={total || undefined} title={title}>
      <strong>{formatPercent(cell.rate === null ? null : Math.round(cell.rate))}</strong>
      <small>{cell.games}</small>
    </td>
  );
}

/**
 * Matchups as a heat grid. Wide screens: a row per own class (and «Всего»),
 * a column per opponent class. Phones: turned, a row per opponent, so eleven
 * opponents never need sideways scrolling. The colour is the distance from
 * 50%; a cell under five games stays uncoloured, so luck does not look like a counter.
 */
export function MatchupHeatmap({ stats, text }: { stats: ConstructedStats; text: ProfileStatsText }) {
  const grid = matchupHeatmap(stats);
  const byOwn = transposeHeatmap(grid);
  const name = (key: HearthstoneClass | 'all') => (key === 'all' ? text.total : CLASS_LABELS[key]);
  const record = (own: HearthstoneClass | 'all', opponent: HearthstoneClass, cell: HeatCell) =>
    `${name(own)} — ${CLASS_LABELS[opponent]}: ${cell.wins}–${cell.games - cell.wins}`;
  return (
    <div className="profile-heat">
      <table className="profile-heat__wide">
        <caption className="player-stats-visually-hidden">{text.matchupsCaption}</caption>
        <thead>
          <tr>
            <td />
            {grid.rows.map(row => <IconHeading key={row.opponent} playerClass={row.opponent} />)}
          </tr>
        </thead>
        <tbody>
          {byOwn.map(own => (
            <tr key={own.key} data-total={own.key === 'all' || undefined}>
              <RowHeading playerClass={own.key} label={name(own.key)} />
              {own.cells.map(cell => (
                <Cell key={cell.opponent} cell={cell} empty={text.noGames} title={record(own.key, cell.opponent, cell)} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <table className="profile-heat__tall">
        <caption className="player-stats-visually-hidden">{text.matchupsCaption}</caption>
        <thead>
          <tr>
            <th scope="col" className="profile-heat__corner"><span className="player-stats-visually-hidden">{text.opponent}</span></th>
            {grid.columns.map(column => (column.key === 'all'
              ? <th key="all" scope="col" className="profile-heat__total">{text.total}</th>
              : <IconHeading key={column.key} playerClass={column.key} />))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map(row => (
            <tr key={row.opponent}>
              <th scope="row" title={CLASS_LABELS[row.opponent]}>
                <span className="profile-heat__icon"><ClassIcon playerClass={row.opponent} size={26} /></span>
                <span className="player-stats-visually-hidden">{CLASS_LABELS[row.opponent]}</span>
              </th>
              {row.cells.map((cell, index) => (
                <Cell key={grid.columns[index].key} cell={cell} empty={text.noGames} total={grid.columns[index].key === 'all'}
                  title={record(grid.columns[index].key, row.opponent, cell)} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
