import { Check, Copy, Layers3 } from 'lucide-react';
import type { DeckBuild } from './viciousGoldModel';

/**
 * Copy and composition actions of a deck that has a build. A deck without one shows nothing:
 * a column of identical "build is updating" notes read as a broken page. `compact` (the Power
 * Tier rows) is a fixed-width icon button; the deck list keeps the site's «Скопировать код
 * колоды» artwork and the toggle of the deck block.
 */
export function BuildActions({ deck, build, copiedDeck, onCopy, onOpen, expanded, compact = false }: {
  deck: string;
  build: DeckBuild | null;
  copiedDeck: string;
  onCopy: (deck: string, code: string) => void;
  onOpen?: (deck: string) => void;
  expanded?: boolean;
  compact?: boolean;
}) {
  if (!build) return <span className="vsgold-build vsgold-build--none" />;
  const name = deck.replace(/^tier:/, '');
  const copied = copiedDeck === deck;
  const label = copied ? 'Код колоды скопирован' : `Скопировать код колоды ${name}`;
  return (
    <span className="vsgold-build">
      {compact ? (
        <button type="button" className="vsgold-build__icon" data-copied={copied ? '' : undefined} title={`Скопировать код колоды (${build.sourceLabel})`}
          onClick={() => onCopy(deck, build.deckCode)} aria-label={label}>
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        </button>
      ) : (
        <button type="button" className="vsgold-build__art" data-copied={copied ? '' : undefined} onClick={() => onCopy(deck, build.deckCode)} aria-label={label}>
          <img src="/assets/ui/deck-code-to-hearthstone.png" alt="" aria-hidden="true" width="1557" height="571" decoding="async" />
        </button>
      )}
      {onOpen && !compact && (
        <button type="button" className="vsgold-build__open" aria-expanded={expanded} onClick={() => onOpen(deck)}>
          <Layers3 size={15} aria-hidden="true" /> {expanded ? 'Скрыть' : 'Колода'}
        </button>
      )}
      <span className="sr-only" aria-live="polite">{copied ? 'Код колоды скопирован' : ''}</span>
    </span>
  );
}
