import { Download, LineChart } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  GameStatsSourceContext,
  PROFILE_STATS_TEXT,
  type ProfileStatsLang,
} from '../../modules/playerStats/public';
import PlayerStatsPanel from './PlayerStatsPanel';
import './PublicPlayerStats.css';

export type PublicStatsCard = (parts: { summary: ReactNode; children: ReactNode }) => ReactNode;

/** A profile whose owner opened the statistics before the app sent a game: what will be here and where to get the app. */
function PublicStatsEmpty({ lang }: { lang: ProfileStatsLang }) {
  const text = PROFILE_STATS_TEXT[lang];
  return (
    <section className="public-player-stats-empty" aria-labelledby="public-player-stats-empty-title">
      <span className="public-player-stats-empty__icon" aria-hidden="true"><LineChart size={22} /></span>
      <div>
        <h2 id="public-player-stats-empty-title">{text.publicEmptyTitle}</h2>
        <p>{text.publicEmptyText}</p>
      </div>
      <a className="public-player-stats-empty__cta" href="/download/"><Download size={16} aria-hidden="true" />{text.install}</a>
    </section>
  );
}

/**
 * Someone's statistics on their public page, once they switched them on.
 * The same views as the account's own tab, fed from the public copy
 * (`/api/profiles/<id>/game-stats`): days instead of times, no global
 * comparison, no recent games. `card` is the profile card: the header strip
 * goes inside its identity plate, the sections under it.
 */
export default function PublicPlayerStats({ publicProfileId, card, lang = 'ru' }: {
  publicProfileId: string;
  card: PublicStatsCard;
  lang?: ProfileStatsLang;
}) {
  return (
    <GameStatsSourceContext.Provider value={publicProfileId}>
      <PlayerStatsPanel
        lang={lang}
        frame={(body, summary) => card({ summary, children: body })}
        pending={card({
          summary: <div className="public-player-stats-pending" aria-hidden="true" />,
          children: <div className="public-player-stats-pending-body" aria-hidden="true" />,
        })}
        empty={card({ summary: null, children: <PublicStatsEmpty lang={lang} /> })}
      />
    </GameStatsSourceContext.Provider>
  );
}
