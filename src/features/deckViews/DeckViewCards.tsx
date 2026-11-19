import { useMemo, type CSSProperties } from 'react';
import { useResolvedDeck } from '../decklist/useResolvedDeck';
import { funDeckEntries } from '../funDecks/deckEntries';
import { CopyDeckButton, DeckLoadState } from '../funDecks/funDeckCardParts';
import { DeckPortrait, ManaCurve } from '../funDecks/FunDeckRowCard';
import { TileEntry } from '../funDecks/FunDeckTilesCard';
import { useNearScreen } from '../funDecks/useNearScreen';
import '../funDecks/FunDeckLayouts.css';

/**
 * The fun-decks tile and row cards for any deck list of the site (archetype
 * builds, a card's decks): the page passes its own title, numbers and tags.
 */
export type DeckStat = { label: string; value: string; tone?: 'up' | 'down' | null };

/** Win rates read green above 52% and red below 48%. */
export function winRateTone(value: number | null | undefined): DeckStat['tone'] {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value >= 52 ? 'up' : value < 48 ? 'down' : null;
}

/** A deck code resolved into the cards of the views, once the deck is about a screen away (`eager`: at once). */
export function useDeckView(deckCode: string, options: { format: 'standard' | 'wild'; archetype?: string }, eager = false) {
  const { ref, near } = useNearScreen<HTMLElement>(eager);
  const resolved = useResolvedDeck(deckCode, { ...options, enabled: near });
  const entries = useMemo(
    () => (resolved.data ? funDeckEntries(resolved.data.cards, resolved.data.sideboards) : []),
    [resolved.data],
  );
  return { ...resolved, entries, ref, near };
}

export type DeckView = ReturnType<typeof useDeckView>;

export type DeckViewCardProps = {
  deckCode: string;
  title: string;
  /** Class and format; a 40-card deck adds its size once its list is known. */
  subtitle: string;
  icon: string;
  badge?: string | null;
  stats: readonly DeckStat[];
  tags?: readonly string[];
  tagsLabel?: string;
  view: DeckView;
  eager?: boolean;
  heading?: 'h2' | 'h3';
};

function fullSubtitle(subtitle: string, view: DeckView): string {
  return view.data?.deckSizeLimit === 40 ? `${subtitle} · 40 карт` : subtitle;
}

function Stats({ stats, className }: { stats: readonly DeckStat[]; className: string }) {
  return (
    <dl className={className} style={{ '--fun-deck-stats': stats.length } as CSSProperties}>
      {stats.map(stat => (
        <div key={stat.label} className={stat.tone ? `is-${stat.tone}` : undefined}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>
      ))}
    </dl>
  );
}

function Tags({ tags, label, className }: { tags: readonly string[]; label: string; className: string }) {
  if (!tags.length) return null;
  return <ul className={className} role="list" aria-label={label}>{tags.map(tag => <li key={tag}>{tag}</li>)}</ul>;
}

/** «Плитки»: one narrow column per deck, many decks side by side. */
export function DeckTileCard(props: DeckViewCardProps) {
  const { deckCode, title, icon, badge, stats, tags = [], tagsLabel = 'Особенности', view, eager = false, heading: Heading = 'h2' } = props;
  return (
    <article className="fun-deck-tiles" ref={view.ref}>
      <header className="fun-deck-tiles__head">
        <img src={icon} alt="" width="34" height="34" loading="lazy" decoding="async" />
        <div>
          <Heading title={title}>{title}</Heading>
          <p><span>{fullSubtitle(props.subtitle, view)}</span>{badge ? <strong>{badge}</strong> : null}</p>
        </div>
      </header>
      <Stats stats={stats} className="fun-deck-tiles__stats" />
      <Tags tags={tags} label={tagsLabel} className="fun-deck-tiles__why" />
      <div className="fun-deck-tiles__deck">
        {view.data?.cards.length ? (
          <ul className="fun-deck-tiles__list" role="list" aria-label={`Состав колоды ${title}`}>
            {view.entries.map(entry => <TileEntry key={entry.card.dbfId} entry={entry} eager={eager} />)}
          </ul>
        ) : <DeckLoadState error={view.error} reload={view.reload} layout="tiles" empty={Boolean(view.data)} />}
      </div>
      <footer className="fun-deck-tiles__foot">
        <CopyDeckButton deckCode={deckCode} title={title} className="fun-deck-tiles__copy" />
      </footer>
    </article>
  );
}

/** «Строки»: one deck per line with round card portraits and the mana curve. */
export function DeckRowCard(props: DeckViewCardProps) {
  const { deckCode, title, icon, badge, stats, tags = [], tagsLabel = 'Особенности', view, eager = false, heading: Heading = 'h2' } = props;
  return (
    <article className="fun-deck-rowcard" ref={view.ref}>
      <header className="fun-deck-rowcard__top">
        <div className="fun-deck-rowcard__identity">
          <span className="fun-deck-rowcard__hero"><img src={icon} alt="" width="40" height="40" loading="lazy" decoding="async" /></span>
          <div>
            <Heading>{title}</Heading>
            <p>{fullSubtitle(props.subtitle, view)}{badge ? <strong>{badge}</strong> : null}</p>
            <Tags tags={tags} label={tagsLabel} className="fun-deck-rowcard__why" />
          </div>
        </div>
        <Stats stats={stats} className="fun-deck-rowcard__stats" />
        <CopyDeckButton deckCode={deckCode} title={title} className="fun-deck-rowcard__copy" />
      </header>
      <div className="fun-deck-rowcard__deck">
        {view.data?.cards.length ? (
          <>
            <ul className="fun-deck-rowcard__cards" role="list" aria-label={`Состав колоды ${title}`}>
              {view.entries.map(entry => (
                <li key={entry.card.dbfId} className={entry.sideboard.length ? 'is-group' : undefined} title={entry.sideboardLabel ?? undefined}>
                  <DeckPortrait card={entry.card} configuredCost={entry.configuredCost} eager={eager} />
                  {entry.sideboard.map(card => <DeckPortrait key={card.dbfId} card={card} small eager={eager} />)}
                </li>
              ))}
            </ul>
            <ManaCurve entries={view.entries} />
          </>
        ) : <DeckLoadState error={view.error} reload={view.reload} layout="rows" empty={Boolean(view.data)} />}
      </div>
    </article>
  );
}
