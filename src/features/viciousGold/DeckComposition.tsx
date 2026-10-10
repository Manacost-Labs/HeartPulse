import HsReplayDeckList from '../HsReplayDeckList';
import DeckRenderPreview from '../deckrender/DeckRenderPreview';
import type { DeckBuild } from './viciousGoldModel';

/** The opened card list of a build, shared by the deck distribution and the Power Tier board. */
export function DeckComposition({ deckLabel, build, titleTag: Title = 'h3', className = '' }: {
  deckLabel: string;
  build: DeckBuild;
  titleTag?: 'h3' | 'h5';
  className?: string;
}) {
  return (
    <section className={`vsgold__deck-composition ${className}`.trim()} aria-label={`Состав колоды ${deckLabel}`}>
      <header>
        <div><span>Актуальная сборка</span><Title>{deckLabel}</Title></div>
        <a href={build.sourceUrl} target="_blank" rel="noreferrer">Источник</a>
      </header>
      <DeckRenderPreview deckCode={build.deckCode} deckName={deckLabel}>
        <HsReplayDeckList cards={build.deckCards || []} label={`Состав колоды ${deckLabel}`} />
      </DeckRenderPreview>
    </section>
  );
}
