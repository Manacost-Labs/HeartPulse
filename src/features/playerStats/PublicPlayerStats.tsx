import { Activity } from 'lucide-react';
import type { ReactNode } from 'react';
import { GameStatsSourceContext } from '../../modules/playerStats/public';
import PlayerStatsPanel from './PlayerStatsPanel';
import './PublicPlayerStats.css';

function Frame({ children }: { children: ReactNode }) {
  return (
    <section className="public-player-stats" aria-labelledby="public-player-stats-title">
      <header className="public-player-stats__head">
        <p className="public-player-stats__eyebrow"><Activity size={14} aria-hidden="true" />Hearthpulse</p>
        <h2 id="public-player-stats-title">Статистика и колоды</h2>
        <p className="public-player-stats__description">Игры из приложения Hearthpulse: рейтинг, колоды с кодами для импорта, герои и забеги Арены.</p>
      </header>
      {children}
    </section>
  );
}

/**
 * Someone's statistics on their public page, once they switched them on.
 * The same views as the account's own tab, fed from the public copy
 * (`/api/profiles/<id>/game-stats`): days instead of times, no global
 * comparison.
 */
export default function PublicPlayerStats({ publicProfileId }: { publicProfileId: string }) {
  return (
    <GameStatsSourceContext.Provider value={publicProfileId}>
      <PlayerStatsPanel
        frame={body => <Frame>{body}</Frame>}
        empty={<Frame><p className="public-player-stats__empty">Игрок ещё не прислал ни одной партии из приложения Hearthpulse.</p></Frame>}
      />
    </GameStatsSourceContext.Provider>
  );
}
