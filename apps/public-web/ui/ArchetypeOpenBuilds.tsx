import './ArchetypeOpenBuilds.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { OpenArchetypeBuild } from '@/apps/public-web/lib/publicArchetypeTeaserData';
import type { ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import { constructedCardPath } from '@/src/modules/constructedCards/public';
import { pluralRu } from '@/src/shared/text/pluralRu';
import { ArchetypeOpenBuildCopy } from './ArchetypeOpenBuildCopy';

const number = (value: number, digits: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits });

function OpenBuild({ build, title, format, now }: { build: OpenArchetypeBuild; title: string; format: 'standard' | 'wild'; now: number }) {
  const date = seoDataDate(build.updatedAt, now);
  return <article className="archetype-open-build">
    <h3>{title}</h3>
    <dl>
      <div><dt>Винрейт</dt><dd>{build.winrate === null ? '—' : `${number(build.winrate, 1)}%`}</dd></div>
      <div><dt>Игры</dt><dd>{build.games === null ? '—' : number(build.games, 0)}</dd></div>
      <div><dt>Данные на</dt><dd>{date ? <time dateTime={date.iso}>{date.date}</time> : '—'}</dd></div>
    </dl>
    {build.cards ? <ol className="archetype-open-build__cards" aria-label={`Карты: ${title}`}>
      {build.cards.map(card => <li key={card.id} data-cost={card.cost}>
        <span><a href={`${constructedCardPath(format, card.id)}/`}>{card.name}</a>{card.count > 1 ? ` ×${card.count}` : ''}</span>
      </li>)}
    </ol> : null}
    <code>{build.deckCode}</code>
    <ArchetypeOpenBuildCopy deckCode={build.deckCode} title={title} />
  </article>;
}

/**
 * The builds of an archetype in the server HTML, the same for a guest, a robot
 * and a reader without scripts: winrate, games, date, the card list linked to
 * the card pages and the deck code. A subscriber gets the interactive gallery
 * in its place once it has loaded. Matchups, mulligan, history and ranks are
 * not here: they stay behind the paywall.
 */
export function ArchetypeOpenBuilds({ item, builds }: { item: ArchetypeDetail['item']; builds: OpenArchetypeBuild[] }) {
  const now = Date.now();
  const total = Math.max(item.deckCount, builds.length);
  return <section className="archetype-open-builds" aria-labelledby="archetype-open-builds-title">
    <header className="archetype-section-heading">
      <div>
        <h2 id="archetype-open-builds-title">Сборки архетипа</h2>
        <p>Источник — {item.sourceUrl ? <a href={item.sourceUrl} rel="noopener">HSGuru</a> : 'HSGuru'}.</p>
      </div>
      <span className="archetype-section-heading__count">
        {builds.length < total ? `${builds.length} из ${total} ${pluralRu(total, 'сборки', 'сборок', 'сборок')}`
          : `${total} ${pluralRu(total, 'сборка', 'сборки', 'сборок')}`}
      </span>
    </header>
    <div className="archetype-open-builds__grid">
      {builds.map((build, index) => <OpenBuild key={`${index}:${build.deckCode}`} build={build} format={item.format} now={now}
        title={`${item.archetypeLabel}, сборка ${index + 1}`} />)}
    </div>
  </section>;
}
