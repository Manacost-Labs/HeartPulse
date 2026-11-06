import { useState } from 'react';
import { Check, Copy, Info } from 'lucide-react';
import { Sparkline } from '../../vendor/varylo-ui/charts/Sparkline';
import {
  classIconUrl,
  deckCards,
  formatPercent,
  type ConstructedStats,
  type DeckCard,
  type ProfileStatsText,
} from '../../modules/playerStats/public';

/** The class art the archetype pages use; the 960 px cut is enough for a card. */
const classArt = (playerClass: DeckCard['playerClass']) => `/archetype-art/classes/${playerClass.toLowerCase()}-960.webp`;
/** The card is dark, so the win rate line takes the header's gold instead of the parchment charts' red. */
const TREND_COLOR = 'var(--arena-gold-light)';

/** Copies a deck code for the game's «Import deck»; on a public profile this is how a visitor takes the deck. */
function CopyDeckCode({ code, text }: { code: string; text: ProfileStatsText }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    }, () => setCopied(false));
  };
  const Icon = copied ? Check : Copy;
  return (
    <button type="button" className="profile-deck__copy" aria-label={copied ? text.codeCopied : text.copyCode}
      title={copied ? text.codeCopied : text.copyCode} onClick={copy}>
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

function Deck({ deck, text }: { deck: DeckCard; text: ProfileStatsText }) {
  return (
    <li className="profile-deck" data-low={deck.low || undefined}>
      <div className="profile-deck__art" aria-hidden="true">
        <img src={classArt(deck.playerClass)} alt="" width="960" height="400" loading="lazy" decoding="async" />
      </div>
      <div className="profile-deck__head">
        <img className="profile-deck__icon" src={classIconUrl(deck.playerClass)} alt="" width="36" height="36" loading="lazy" decoding="async" />
        <div className="profile-deck__name">
          <h4>{deck.title}</h4>
          <p>{deck.subtitle}</p>
        </div>
        {deck.deckCode ? <CopyDeckCode code={deck.deckCode} text={text} /> : null}
      </div>
      <div className="profile-deck__numbers">
        <p className="profile-deck__rate" data-tone={deck.low ? undefined : Math.sign(deck.tone) || undefined}>
          {formatPercent(deck.rate)}
          {deck.low ? <span title={text.lowSample}><Info size={14} aria-hidden="true" /><span className="player-stats-visually-hidden">{text.lowSample}</span></span> : null}
        </p>
        <p className="profile-deck__record">
          {text.gamesCount(deck.games)} · {deck.wins}–{deck.losses}
          {deck.globalRate !== null ? <span> · {text.vsAll} {formatPercent(deck.globalRate)}</span> : null}
        </p>
        {deck.trend ? (
          <Sparkline className="profile-deck__trend" data={deck.trend} width={120} height={36} color={TREND_COLOR} showDot
            ariaLabel={`${text.winrate}: ${formatPercent(deck.trend[0])} → ${formatPercent(deck.trend[deck.trend.length - 1])}`} />
        ) : null}
      </div>
    </li>
  );
}

/** The player's decks as cards: class art, win rate against 50%, record and the win rate line of the latest games. */
export function DeckCards({ stats, text }: { stats: ConstructedStats; text: ProfileStatsText }) {
  const decks = deckCards(stats);
  return (
    <ul className="profile-decks" aria-label={text.decks}>
      {decks.map(deck => <Deck key={deck.key} deck={deck} text={text} />)}
    </ul>
  );
}
