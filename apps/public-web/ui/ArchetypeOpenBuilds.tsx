import './ArchetypeOpenBuilds.css';
import type { OpenArchetypeBuild } from '@/apps/public-web/lib/publicArchetypeTeaserData';
import type { ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import { pluralRu } from '@/src/shared/text/pluralRu';
import { ArchetypeOpenBuild } from './ArchetypeOpenBuild';
import { ArchetypeOpenBuildsMore } from './ArchetypeOpenBuildsMore';

/**
 * The builds of an archetype in the server HTML, the same for a guest, a robot
 * and a reader without scripts: the first page of builds with winrate, games,
 * date, the card list linked to the card pages and the deck code; «Загрузить
 * ещё» opens the rest. A subscriber gets the interactive gallery in its place
 * once it has loaded. Matchups, mulligan, history and ranks are not here:
 * they stay behind the paywall.
 */
export function ArchetypeOpenBuilds({ item, builds, total, next }: {
  item: ArchetypeDetail['item']; builds: OpenArchetypeBuild[]; total: number; next: number | null;
}) {
  // Without builds the page's own «Колоды появятся…» note stands; builds the allowlist refused leave one short line.
  if (!builds.length && next === null && item.deckCount === 0) return null;
  const now = Date.now();
  return <section className="archetype-open-builds" aria-labelledby="archetype-open-builds-title">
    <header className="archetype-section-heading">
      <div>
        <h2 id="archetype-open-builds-title">Сборки архетипа</h2>
        <p>Источник — {item.sourceUrl ? <a href={item.sourceUrl} rel="noopener">HSGuru</a> : 'HSGuru'}. Выборка сборок своя — цифры могут отличаться от архетипа.</p>
      </div>
      {builds.length || next !== null ? <span className="archetype-section-heading__count">{total} {pluralRu(total, 'сборка', 'сборки', 'сборок')}</span> : null}
    </header>
    {builds.length || next !== null ? <div className="archetype-open-builds__grid">
      {builds.map((build, index) => <ArchetypeOpenBuild key={`${index}:${build.deckCode}`} build={build} format={item.format} now={now}
        title={`${item.archetypeLabel}, сборка ${index + 1}`} />)}
      <ArchetypeOpenBuildsMore format={item.format} slug={item.slug} label={item.archetypeLabel}
        shownCodes={builds.map(build => build.deckCode)} next={next} total={total} />
    </div> : <p className="archetype-open-builds__empty">Сборок пока нет.</p>}
  </section>;
}
