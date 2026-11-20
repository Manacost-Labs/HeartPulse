import './ArchetypeSeoSummary.css';
import {
  archetypeCountText, archetypeSeoFacts, formatNumber, isLevelWithMedian, type ArchetypeSeoFacts, type MedianComparison,
} from '@/apps/public-web/lib/archetypeSeoSummary';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { hsguruSourceUrl } from '@/apps/public-web/lib/seoDataSource';
import { archetypeTitleAlias, detailPeriodLabel, FORMAT_GENITIVE } from '@/apps/public-web/lib/seoDataValues';
import type { StandardMetaClass } from '@/shared/standardMetaContract';
import type { ArchetypeCatalog, ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import { INDEXABLE_ARCHETYPE_MIN_GAMES } from '@/shared/constructedArchetypeIndexing';

type Item = ArchetypeDetail['item'];
type Row = Pick<Item, 'slug' | 'archetype' | 'archetypeLabel'>;

/** «Другие архетипы Паладина»: the class after a noun. */
const CLASS_GENITIVE: Record<StandardMetaClass, string> = {
  deathknight: 'Рыцаря смерти', demonhunter: 'Охотника на демонов', druid: 'Друида', hunter: 'Охотника', mage: 'Мага',
  paladin: 'Паладина', priest: 'Жреца', rogue: 'Разбойника', shaman: 'Шамана', warlock: 'Чернокнижника', warrior: 'Воина',
};
const MIN_GAMES = formatNumber(INDEXABLE_ARCHETYPE_MIN_GAMES, 0);

const percent = (value: number) => `${formatNumber(value)}%`;
/** The name with the source's own name in brackets, for a name another catalog row shares. */
const withAlias = (label: string, alias: string | null) => (alias ? `${label} (${alias})` : label);

/** «+4,7 п. п.», «−1,2 п. п.» or «на уровне»: the archetype against a median. */
function Delta({ comparison }: { comparison: MedianComparison }) {
  if (isLevelWithMedian(comparison)) return <span className="archetype-seo-summary__delta">на уровне</span>;
  const up = comparison.delta > 0;
  return <span className="archetype-seo-summary__delta" data-trend={up ? 'up' : 'down'}>
    {`${up ? '+' : '−'}${formatNumber(Math.abs(comparison.delta))} п. п.`}
  </span>;
}

function MedianPlate({ label, comparison, of }: { label: string; comparison: MedianComparison; of: string }) {
  const sample = `${archetypeCountText(comparison.archetypes)} ${of} от ${MIN_GAMES} игр`;
  return <div title={`Медианный винрейт ${sample}`}>
    <dt>{label}</dt>
    <dd><span className="archetype-seo-summary__value">{percent(comparison.median)}</span> <Delta comparison={comparison} /></dd>
    <dd className="archetype-seo-summary__note">{`среди ${sample}`}</dd>
  </div>;
}

/** Place by games and the two medians, as the plates of the page's own metrics. */
function Plates({ item, facts }: { item: Item; facts: ArchetypeSeoFacts }) {
  const { formatComparison, classComparison, gamesPlace } = facts;
  const ofFormat = FORMAT_GENITIVE[item.format];
  const classOf = item.classKey ? CLASS_GENITIVE[item.classKey] : null;
  return <dl className="archetype-seo-summary__plates">
    {gamesPlace ? <div title={`Место по числу игр среди всех архетипов ${ofFormat} в каталоге`}>
      <dt>Место по играм</dt>
      <dd><span className="archetype-seo-summary__value">{gamesPlace.place}</span> из {formatNumber(gamesPlace.of, 0)}</dd>
      <dd className="archetype-seo-summary__note">{`архетипов ${ofFormat}`}</dd>
    </div> : null}
    {formatComparison ? <MedianPlate label="Медиана формата" comparison={formatComparison} of={ofFormat} /> : null}
    {classComparison && classOf ? <MedianPlate label="Медиана класса" comparison={classComparison} of={classOf} /> : null}
  </dl>;
}

/**
 * The block under an archetype page, in the server HTML and the same for every
 * reader: where the archetype stands among the others (place by games, the
 * median winrate of the format and of the class), the date, period and source
 * of the numbers, and links to the other archetypes of its class. Built from
 * the teaser and the public catalog, never from builds, history or analysis.
 * It renders for every archetype; only the indexable ones are offered to search
 * engines (shared/constructedArchetypeIndexing.ts).
 */
export function ArchetypeSeoSummary({ detail, catalog }: { detail: ArchetypeDetail; catalog: ArchetypeCatalog | null }) {
  const { item } = detail;
  const source = hsguruSourceUrl(item.sourceUrl);
  const nameOf = (row: Row) => withAlias(row.archetypeLabel, catalog ? archetypeTitleAlias(row, catalog.items) : null);
  const date = seoDataDate(detail.updatedAt, Date.now());
  const period = detailPeriodLabel(detail);
  const facts = archetypeSeoFacts(item, catalog);
  const hasPlates = Boolean(facts.gamesPlace || facts.formatComparison || (facts.classComparison && item.classKey));
  const classOf = item.classKey ? CLASS_GENITIVE[item.classKey] : null;
  const ofFormat = FORMAT_GENITIVE[item.format];
  return (
    <section className="archetype-seo-summary" aria-labelledby={hasPlates ? 'archetype-seo-summary-title' : undefined}
      aria-label={hasPlates ? undefined : 'Данные архетипа'}>
      {hasPlates ? <h2 id="archetype-seo-summary-title">{`Среди архетипов ${ofFormat}`}</h2> : null}
      {hasPlates ? <Plates item={item} facts={facts} /> : null}
      {item.games < INDEXABLE_ARCHETYPE_MIN_GAMES ? <p className="archetype-seo-summary__hint">
        Выборка меньше {MIN_GAMES} игр: винрейт ненадёжен.
      </p> : null}
      <p className="archetype-seo-summary__source">
        {date ? <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time> : null}
        {period ? <span>{period}</span> : null}
        <span>Источник: {source ? <a href={source} rel="noopener noreferrer">HSGuru</a> : 'HSGuru'}</span>
      </p>
      {facts.neighbours.length && classOf ? <nav className="archetype-seo-summary__class" aria-labelledby="archetype-seo-summary-class">
        <h3 id="archetype-seo-summary-class">{`Другие архетипы ${classOf}`}</h3>
        <ul>
          {facts.neighbours.map(row => <li key={row.slug}>
            <a href={`/standard/archetypes/${row.format}/${row.slug}/`}>
              <span>{nameOf(row)}</span>
              {row.winrate === null ? null : <span className="archetype-seo-summary__winrate">{percent(row.winrate)}</span>}
            </a>
          </li>)}
        </ul>
      </nav> : null}
      <p className="archetype-seo-summary__all">
        <a href={item.format === 'wild' ? '/standard/archetypes/?format=wild' : '/standard/archetypes/'}>{`Все архетипы ${ofFormat}`}</a>
      </p>
    </section>
  );
}
