import ConstructedCardHistoryPanel from './ConstructedCardHistoryPanel';
import type { ConstructedCardHistoryPoint } from './constructedCardHistoryModel';

const DAY = 24 * 60 * 60_000;
const DAYS = 35;

/**
 * A made-up gentle series (not the card's): the locked block draws the real panel with it, so a guest sees
 * the chart, the switches and the side figures that are closed, and the block is exactly as tall as a
 * subscriber's with a history. Muted and out of reach of readers and the keyboard; the lock sits above it.
 */
function placeholderHistory(now: number): ConstructedCardHistoryPoint[] {
  return Array.from({ length: DAYS * 4 }, (_, index): ConstructedCardHistoryPoint => {
    const day = index / 4;
    return {
      recordedAt: new Date(now - DAYS * DAY + index * 6 * 60 * 60_000).toISOString(),
      deckPopularity: 12 + Math.sin(day / 4) * 2, deckWinrate: 51 + Math.cos(day / 3), timesPlayed: Math.round(2400 + Math.sin(day / 5) * 500),
      winrateWhenPlayed: 54 + Math.sin(day / 2.5) * 1.5, averageCopies: null, winrateWhenDrawn: null, keepPercentage: null,
      openingHandWinrate: null, averageTurnsInHand: null, averageTurnPlayed: null,
    };
  });
}

/** The body of the opened «Динамика карты» for a viewer without access (loaded only when it opens). */
export default function ConstructedCardHistoryLocked() {
  const now = Date.now();
  return (
    <div className="constructed-card-history__muted" aria-hidden="true" inert>
      <ConstructedCardHistoryPanel points={placeholderHistory(now)} days={30} onDaysChange={() => undefined} now={now} />
    </div>
  );
}
