import './ArchetypeOpenBuilds.css';
import './FunDecksOpenList.css';
import { metaDistance, score } from '@/src/features/FunDeckFacts';
import { funDeckClassMeta, funDeckFormat, funDeckFormatLabel } from '@/src/features/funDecks/deckMeta';
import { funDeckWhy, type FunDecksPayload } from '@/src/features/funDecksPreview';
import { ArchetypeOpenBuild } from './ArchetypeOpenBuild';

/**
 * Every fun deck in the server HTML for everyone: a guest, a robot and a
 * subscriber see the same list. One deck is the archetypes' open build
 * (`ArchetypeOpenBuild`: winrate, games, date, the card list linked to the
 * card pages of the deck's format, the deck code with its copy button) plus the
 * deck's own facts. The interactive page (filters, three layouts, deck
 * pictures) takes its place once the full answer has loaded. No deck is left
 * out: one without a card list (a code that does not decode, no catalog yet)
 * keeps its numbers, its code and the copy button.
 */
export function FunDecksOpenList({ preview }: { preview: FunDecksPayload }) {
  const { decks } = preview;
  if (!decks.length) return null;
  const now = Date.now();
  return <section className="archetype-open-builds fun-decks-open" aria-label="Подборка фан-колод">
    <div className="archetype-open-builds__grid">
      {decks.map((deck, index) => {
        const why = funDeckWhy(deck);
        return <ArchetypeOpenBuild key={`${deck.format}:${deck.deckCode}`} title={deck.title} format={funDeckFormat(deck)} now={now}
          build={{
            deckCode: deck.deckCode, games: deck.games, winrate: deck.winRate, updatedAt: deck.lastSeenAt ?? deck.firstSeenAt,
            cards: deck.cards ?? null,
          }}
          facts={<div className="fun-decks-open__facts" data-tour-id={index === 0 ? 'fun-decks-card-metrics' : undefined}>
            <p>{funDeckFormatLabel(deck)} · {funDeckClassMeta(deck).label}{deck.streamer ? ` · ${deck.streamer}` : ''}</p>
            <dl>
              <div><dt>Индекс фана</dt><dd>{score(deck.funScore)}</dd></div>
              <div><dt>Не похожа на мету</dt><dd>{metaDistance(deck.maxMetaSimilarity)}</dd></div>
            </dl>
            {why.length ? <ul aria-label="Почему колода считается фановой">{why.map(label => <li key={label}>{label}</li>)}</ul> : null}
          </div>} />;
      })}
    </div>
  </section>;
}
