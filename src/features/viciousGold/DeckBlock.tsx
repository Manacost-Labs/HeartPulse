import ConstructedArchetypeDeckGallery from '../ConstructedArchetypeDeckGallery';
import { classKey, type DeckBuild, type DeckDistribution } from './viciousGoldModel';

/** The archetype page's deck block (render, card list, «Скопировать код колоды») with its source named. */
export default function DeckBlock({ deck, build }: { deck: DeckDistribution; build: DeckBuild }) {
  return <>
    <p className="vsgold-deck-composition__source">
      Источник: <a href={build.sourceUrl} target="_blank" rel="noreferrer">{build.sourceLabel}</a>
      {build.matchMethod === 'alias' ? <>, архетип «{build.matchedArchetype}»</> : null}
    </p>
    <ConstructedArchetypeDeckGallery format="standard" archetype={build.matchedArchetype} classKey={classKey(deck.class)}
      builds={[{
        deckCode: build.deckCode, games: build.sampleGames, winrate: build.winrate, sourceUrl: build.sourceUrl,
        updatedAt: build.updatedAt, sampleRank: 'legend', samplePeriod: '',
      }]} />
  </>;
}
