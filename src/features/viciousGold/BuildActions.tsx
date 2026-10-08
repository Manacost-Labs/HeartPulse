import { Layers3 } from 'lucide-react';
import { isAggregateDeck, missingBuildLabel, type BuildState, type DeckBuild } from './viciousGoldModel';

export function BuildActions({ deck, build, buildState, copiedDeck, onCopy, onOpen, expanded }: {
  deck: string;
  build: DeckBuild | null;
  buildState: BuildState;
  copiedDeck: string;
  onCopy: (deck: string, code: string) => void;
  onOpen?: (deck: string) => void;
  expanded?: boolean;
}) {
  if (!build) {
    return (
      <span className={isAggregateDeck(deck) ? 'vsgold__build-aggregate' : 'vsgold__build-missing'}>
        {missingBuildLabel(deck, buildState)}
      </span>
    );
  }
  return (
    <div className="vsgold__build">
      <button
        type="button"
        className={`vsgold__build-copy-button${copiedDeck === deck ? ' vsgold__build-copy-button--copied' : ''}`}
        onClick={() => onCopy(deck, build.deckCode)}
        aria-label={copiedDeck === deck ? 'Код колоды скопирован' : `Скопировать код колоды ${deck.replace(/^tier:/, '')}`}
      >
        <img src="/assets/ui/deck-code-to-hearthstone.png" alt="" aria-hidden="true" width="1557" height="571" decoding="async" />
        <span className="vsgold__copy-feedback" aria-live="polite">
          {copiedDeck === deck ? 'Код колоды скопирован' : ''}
        </span>
      </button>
      {onOpen && <button type="button" className="vsgold__build-open" aria-expanded={expanded} onClick={() => onOpen(deck)}><Layers3 size={15} /> {expanded ? 'Скрыть' : 'Состав'}</button>}
      <span>{build.matchMethod === 'alias' ? `${build.sourceLabel}, точный синоним` : build.sourceLabel}</span>
    </div>
  );
}
