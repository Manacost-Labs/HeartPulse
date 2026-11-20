import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { pluralRu } from '@/src/shared/text/pluralRu';
import type { ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import { OpenDeckCardList } from './OpenDeckCardList';
import { OpenDeckCopyButton } from './OpenDeckCopyButton';

const number = (value: number, digits = 1) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits });

/**
 * The builds of an archetype in the server HTML for everyone: a guest, a robot
 * and a signed-in visitor without a subscription see the same list, with the
 * winrate, the games, the date, the card list and the deck code. A subscriber
 * gets the interactive gallery in its place once it has loaded. Matchups,
 * mulligan, history and ranks are not here: they stay in `.paywalled-archetype`.
 */
export function ArchetypeOpenBuilds({ detail }: { detail: ArchetypeDetail }) {
  const { item } = detail;
  const builds = item.builds.filter(build => build.cards?.length);
  if (!builds.length) return null;
  const now = Date.now();
  return <section className="open-deck-list" aria-labelledby="archetype-open-builds-title" data-tour-id="archetype-builds">
    <header className="archetype-section-heading">
      <div>
        <h2 id="archetype-open-builds-title">Сборки архетипа</h2>
        <p>Код можно скопировать и сразу импортировать в Hearthstone.</p>
      </div>
      <span className="archetype-section-heading__count">
        {builds.length < item.deckCount ? `${builds.length} из ${item.deckCount}` : item.deckCount} {pluralRu(item.deckCount, 'сборка', 'сборки', 'сборок')}
      </span>
    </header>
    <div className="open-deck-list__grid">
      {builds.map((build, index) => {
        const date = seoDataDate(build.updatedAt, now);
        const title = `${item.archetypeLabel}, сборка ${index + 1}`;
        return <article key={build.deckCode} className="open-deck">
          <h3>Сборка {index + 1}</h3>
          <dl className="open-deck__facts">
            <div><dt>Винрейт</dt><dd>{build.winrate === null ? '—' : `${number(build.winrate)}%`}</dd></div>
            <div><dt>Игры</dt><dd>{build.games === null ? '—' : number(build.games, 0)}</dd></div>
            <div><dt>Данные на</dt><dd>{date ? <time dateTime={date.iso}>{date.date}</time> : '—'}</dd></div>
          </dl>
          <OpenDeckCardList cards={build.cards ?? []} label={`Карты: ${title}`} />
          <div className="open-deck__code">
            <code>{build.deckCode}</code>
            <OpenDeckCopyButton code={build.deckCode} title={title} />
          </div>
        </article>;
      })}
    </div>
  </section>;
}
