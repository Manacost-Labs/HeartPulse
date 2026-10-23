import { cardImageUrl } from '../model/format';
import type { BoardMinion } from '../model/stats';
import './PlayerStatsCharts.css';

/** The final board as the game shows it: up to seven portraits with attack and health, golden ones ringed. */
export function MinionBoard({ board, names, size = 'md' }: {
  board: readonly BoardMinion[];
  names: Record<string, string>;
  size?: 'sm' | 'md';
}) {
  if (!board.length) return null;
  return (
    <ul className={`player-stats-board player-stats-board--${size}`} aria-label="Финальная доска">
      {board.map((minion, index) => {
        const name = names[minion.cardId] ?? minion.cardId;
        return (
          <li key={`${minion.cardId}-${index}`} className={minion.golden ? 'is-golden' : undefined}
            title={`${name}${minion.golden ? ' (золотой)' : ''}: ${minion.attack}/${minion.health}`}>
            <span className="player-stats-board__art">
              <img src={cardImageUrl(minion.cardId)} alt="" decoding="async" />
            </span>
            <span className="player-stats-board__attack">{minion.attack}</span>
            <span className="player-stats-board__health">{minion.health}</span>
            <span className="player-stats-visually-hidden">
              {name}{minion.golden ? ', золотой' : ''}, {minion.attack} атаки, {minion.health} здоровья
            </span>
          </li>
        );
      })}
    </ul>
  );
}
