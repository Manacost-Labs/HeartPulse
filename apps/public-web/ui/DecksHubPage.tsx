import './ArchetypeOpenBuilds.css';
import './DecksPages.css';
import '@/src/route-parchment.css';
import type { OpenArchetypeBuild } from '@/apps/public-web/lib/publicArchetypeTeaserData';
import { archetypePath, classDecksPath, hubArchetypes, MIN_GAMES_TEXT, type DeckArchetype } from '@/apps/public-web/lib/classDecks';
import type { ArchetypeCatalog } from '@/src/features/ConstructedArchetypes';
import { ArchetypeOpenBuildCopy } from './ArchetypeOpenBuildCopy';
import { DecksBanner, DecksStructuredData } from './DecksPageParts';
import { SharedPageShell } from './SharedPageShell';

const number = (value: number, digits: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits });

/**
 * `/standard/decks/`: for each of the eleven classes its best archetype above the indexing threshold with winrate,
 * games and the deck code of its best build, a link to the archetype and to the class page. Server HTML, the same
 * for every visitor; the copy buttons are the only client islands.
 */
export function DecksHubPage({ catalog, builds }: { catalog: ArchetypeCatalog; builds: ReadonlyMap<string, OpenArchetypeBuild | null> }) {
  const classes = hubArchetypes(catalog);
  const shown = classes.flatMap(({ best }) => (best ? [best] : []));
  return <>
    <DecksStructuredData path="/standard/decks/" name="Лучшие колоды Hearthstone" updatedAt={catalog.updatedAt}
      crumbs={[{ name: 'Стандарт', path: '/standard/' }, { name: 'Лучшие колоды', path: '/standard/decks/' }]}
      items={shown.map(row => ({ name: row.archetypeLabel, url: `https://hearthpulse.net${archetypePath(row.slug)}` }))} />
    <SharedPageShell pathname="/standard/decks/">
      <article className="decks-page">
        <DecksBanner title="Лучшие колоды Hearthstone" updatedAt={catalog.updatedAt} rows={shown} />
        <ul className="decks-hub__classes">
          {classes.map(({ entry, best }) => <li key={entry.key}>
            <h2>{entry.name}</h2>
            {best ? <HubArchetype row={best} build={builds.get(best.slug) ?? null} /> : <p>Нет архетипов {MIN_GAMES_TEXT}.</p>}
            <a className="decks-hub__class-link" href={classDecksPath(entry.key)}>Все колоды {entry.genitive}</a>
          </li>)}
        </ul>
        <p className="decks-page__links"><a href="/standard/meta/">Мета Стандарта: тир-лист архетипов</a></p>
      </article>
    </SharedPageShell>
  </>;
}

function HubArchetype({ row, build }: { row: DeckArchetype; build: OpenArchetypeBuild | null }) {
  return <>
    <a className="decks-hub__archetype" href={archetypePath(row.slug)}>{row.archetypeLabel}</a>
    <dl className="decks-page__facts">
      <div><dt>Винрейт</dt><dd>{row.winrate === null ? '—' : `${number(row.winrate, 1)}%`}</dd></div>
      <div><dt>Игры</dt><dd>{number(row.games, 0)}</dd></div>
    </dl>
    {build ? <div className="decks-hub__code">
      <code>{build.deckCode}</code>
      <ArchetypeOpenBuildCopy deckCode={build.deckCode} title={row.archetypeLabel} />
    </div> : <p>Код сборки пока недоступен.</p>}
  </>;
}
