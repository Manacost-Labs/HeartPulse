import './ArchetypeOpenBuilds.css';
import './DecksPages.css';
import '@/src/route-parchment.css';
import type { OpenArchetypeBuild } from '@/apps/public-web/lib/publicArchetypeTeaserData';
import {
  archetypePath, CLASS_DECKS_MIN_ARCHETYPES, classArchetypes, classDecksIndexable, classDecksPath, MIN_GAMES_TEXT, type DeckClass,
} from '@/apps/public-web/lib/classDecks';
import type { ArchetypeCatalog } from '@/src/features/ConstructedArchetypes';
import { ArchetypeOpenBuild } from './ArchetypeOpenBuild';
import { DecksBanner, DecksStructuredData } from './DecksPageParts';
import { SharedPageShell } from './SharedPageShell';

const percent = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`);

/**
 * `/standard/decks/<class>/`: the class's archetypes above the indexing threshold (winrate, popularity, games, a
 * link to each archetype), then the best build of each with its card list and deck code. Server HTML, the same for
 * every visitor; the copy buttons are the only client islands. A class below the content threshold says so.
 */
export function ClassDecksPage({ entry, catalog, builds }: {
  entry: DeckClass; catalog: ArchetypeCatalog; builds: ReadonlyMap<string, OpenArchetypeBuild | null>;
}) {
  const rows = classArchetypes(catalog, entry.key);
  const path = classDecksPath(entry.key);
  const now = Date.now();
  return <>
    <DecksStructuredData path={path} name={`Колоды ${entry.genitive}`} updatedAt={catalog.updatedAt}
      crumbs={[{ name: 'Лучшие колоды', path: '/standard/decks/' }, { name: entry.name, path }]}
      items={rows.map(row => ({ name: row.archetypeLabel, url: `https://hearthpulse.net${archetypePath(row.slug)}` }))} />
    <SharedPageShell pathname={path}>
      <article className="decks-page">
        <DecksBanner title={`Колоды ${entry.genitive}`} updatedAt={catalog.updatedAt} rows={rows} />
        {classDecksIndexable(rows) ? null : <p className="decks-page__notice">
          Мало данных: {rows.length} из {CLASS_DECKS_MIN_ARCHETYPES} нужных архетипов {MIN_GAMES_TEXT}, страница не индексируется.
        </p>}
        {rows.length ? <div className="decks-class__table" role="region" aria-label={`Архетипы ${entry.genitive}`} tabIndex={0}>
          <table>
            <caption>Архетипы {entry.genitive} {MIN_GAMES_TEXT}</caption>
            <thead><tr><th scope="col">Архетип</th><th scope="col">Винрейт</th><th scope="col">Популярность</th><th scope="col">Игры</th></tr></thead>
            <tbody>
              {rows.map(row => <tr key={row.slug}>
                <th scope="row"><a href={archetypePath(row.slug)}>{row.archetypeLabel}</a></th>
                <td>{percent(row.winrate)}</td><td>{percent(row.popularity)}</td><td>{row.games.toLocaleString('ru-RU')}</td>
              </tr>)}
            </tbody>
          </table>
        </div> : <p>Архетипов {MIN_GAMES_TEXT} у класса сейчас нет.</p>}
        {rows.length ? <section className="archetype-open-builds" aria-labelledby="decks-class-builds">
          <h2 id="decks-class-builds" className="decks-class__builds-title">Лучшие сборки</h2>
          <div className="archetype-open-builds__grid">
            {rows.map(row => {
              const build = builds.get(row.slug);
              return build ? <ArchetypeOpenBuild key={row.slug} build={build} format="standard" now={now} title={row.archetypeLabel} />
                : <p key={row.slug} className="decks-page__missing">{row.archetypeLabel}: код сборки пока недоступен.</p>;
            })}
          </div>
        </section> : null}
        <p className="decks-page__links">
          <a href="/standard/decks/">Лучшие колоды всех классов</a> · <a href="/standard/meta/">Мета Стандарта</a>
        </p>
      </article>
    </SharedPageShell>
  </>;
}
