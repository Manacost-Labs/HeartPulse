import './ArchetypeSeoSummary.css';
import type { ReactNode } from 'react';
import {
  archetypeCountText, archetypeSeoFacts, formatNumber, formatShare, isLevelWithMedian, type ArchetypeSeoFacts, type MedianComparison,
} from '@/apps/public-web/lib/archetypeSeoSummary';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { hsguruSourceUrl } from '@/apps/public-web/lib/seoDataSource';
import { archetypeTitleAlias, detailPeriodLabel, FORMAT_GENITIVE, FORMAT_LOCATIVE } from '@/apps/public-web/lib/seoDataValues';
import { STANDARD_META_CLASS_LABELS } from '@/src/features/standardMetaClassModel';
import type { ArchetypeCatalog, ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import { INDEXABLE_ARCHETYPE_MIN_GAMES } from '@/shared/constructedArchetypeIndexing';
import { pluralRu } from '@/src/shared/text/pluralRu';

type Item = ArchetypeDetail['item'];

const percent = (value: number) => `${formatNumber(value)}%`;
const gamesText = (games: number) => `${formatNumber(games, 0)} ${pluralRu(games, 'игра', 'игры', 'игр')}`;
// With fewer class links than this the text falls short of its length: the primer takes their place.
const MIN_NEIGHBOURS_WITHOUT_PRIMER = 3;
const SAMPLE_FROM = `с выборкой от ${formatNumber(INDEXABLE_ARCHETYPE_MIN_GAMES, 0)} игр`;
/** The name with the source's own name in brackets, for a name another catalog row shares. */
const withAlias = (label: string, alias: string | null) => (alias ? `${label} (${alias})` : label);

/** The end of a sentence: «выше медианы на 0,8 п. п.» (the abbreviation brings its own full stop). */
function relation(comparison: MedianComparison): string {
  if (isLevelWithMedian(comparison)) return 'на уровне медианы.';
  return `${comparison.delta > 0 ? 'выше' : 'ниже'} медианы на ${formatNumber(Math.abs(comparison.delta))} п. п.`;
}

/** «винрейт — 51,2%, популярность — 1,7%, в выборке 53 208 игр, известно 86 сборок»: what the teaser has. */
function ownNumbers(item: Item): string {
  return [
    item.winrate === null ? null : `винрейт — ${percent(item.winrate)}`,
    item.popularity === null ? null : `популярность — ${formatShare(item.popularity)}`,
    item.games > 0 ? `в выборке ${gamesText(item.games)}` : null,
    item.deckCount > 0 ? `известно ${item.deckCount} ${pluralRu(item.deckCount, 'сборка', 'сборки', 'сборок')}` : null,
  ].filter(Boolean).join(', ');
}

type Frame = {
  item: Item;
  /** The name the text calls the archetype: the Russian one, with the English one in brackets when another archetype shares it. */
  name: string;
  /** The same for any other row of the catalog. */
  nameOf: (row: Pick<Item, 'slug' | 'archetype' | 'archetypeLabel'>) => string;
  className: string | null;
  where: string;
  ofFormat: string;
  hsguru: ReactNode;
};

/** The answer: who the archetype is and what the public numbers say, as of the date of the data. */
function Lead({ detail, frame }: { detail: ArchetypeDetail; frame: Frame }) {
  const { className, where, hsguru } = frame;
  const date = seoDataDate(detail.updatedAt, Date.now());
  const period = detailPeriodLabel(detail);
  const numbers = ownNumbers(frame.item);
  return (
    <p>
      {frame.name} — архетип{className ? ` класса ${className}` : ''} {where} Hearthstone.
      {' '}По данным {hsguru}
      {date ? <> на <time dateTime={date.iso}>{date.date}, {date.time} МСК</time></> : null}
      {period ? ` за период «${period}»` : ''}
      {numbers ? `: ${numbers}.` : '.'}
    </p>
  );
}

/** The yardsticks: the median of the format and of the class, the place by games, a warning for a thin sample. */
function Comparison({ facts, frame }: { facts: ArchetypeSeoFacts; frame: Frame }) {
  const { item, className, ofFormat } = frame;
  const { formatComparison, classComparison, gamesPlace } = facts;
  if (!formatComparison && !classComparison && !gamesPlace && item.games >= INDEXABLE_ARCHETYPE_MIN_GAMES) return null;
  return (
    <p>
      {formatComparison ? <>
        Медианный винрейт {archetypeCountText(formatComparison.archetypes)} {ofFormat} {SAMPLE_FROM} — {percent(formatComparison.median)}, а {item.archetypeLabel} {relation(formatComparison)}{' '}
      </> : null}
      {classComparison && className ? <>
        Среди {archetypeCountText(classComparison.archetypes)} класса {className} {SAMPLE_FROM} медиана — {percent(classComparison.median)}, а он {relation(classComparison)}{' '}
      </> : null}
      {gamesPlace ? <>По числу игр он на {gamesPlace.place}-м месте из {archetypeCountText(gamesPlace.of)} {ofFormat}. </> : null}
      {item.games < INDEXABLE_ARCHETYPE_MIN_GAMES ? `Выборка архетипа меньше ${formatNumber(INDEXABLE_ARCHETYPE_MIN_GAMES, 0)} игр, поэтому его винрейт ненадёжен и может заметно измениться.` : null}
    </p>
  );
}

/** Other archetypes of the class, so a reader (and a crawler) can walk the class without JavaScript. */
function Neighbours({ facts, frame }: { facts: ArchetypeSeoFacts; frame: Frame }) {
  const { className, where } = frame;
  if (facts.neighbours.length === 0 || !className) return null;
  return <>
    <p>Другие архетипы класса {className} {where}:</p>
    <ul className="archetype-seo-summary__links">
      {facts.neighbours.map(row => <li key={row.slug}>
        <a href={`/standard/archetypes/${row.format}/${row.slug}/`}>{frame.nameOf(row)}</a>
        {row.winrate === null ? '' : ` — ${percent(row.winrate)}`}
      </li>)}
    </ul>
  </>;
}

/**
 * What an archetype is and how to weigh its numbers: the part of the text that
 * needs no catalog. It stands in for the class links and the comparison when the
 * catalog did not answer (or lists nothing to link), so a page never has less
 * than the text it is indexed for.
 */
function Primer() {
  return (
    <p>
      Что такое архетип. Это семейство колод с общим планом игры и ядром карт: отдельные карты в них могут отличаться, а способ побеждать остаётся тем же.
      {' '}Чем больше игр в выборке, тем надёжнее цифры: на малой выборке винрейт может сильно меняться.
      {' '}Чтобы понять, много это или мало, сравнивайте архетип с другими архетипами того же класса и формата в каталоге: там у каждого видны винрейт, популярность и число игр.
    </p>
  );
}

/**
 * The text of an archetype page that a reader without JavaScript, a search
 * engine and an answer engine get: what the public numbers say, how to read
 * them, where they come from and where the paid part starts. Built from the
 * teaser the page shows and the public catalog, never from builds, history or
 * analysis. It renders for every archetype; only the indexable ones are
 * offered to search engines (shared/constructedArchetypeIndexing.ts).
 */
export function ArchetypeSeoSummary({ detail, catalog }: { detail: ArchetypeDetail; catalog: ArchetypeCatalog | null }) {
  const { item } = detail;
  const source = hsguruSourceUrl(item.sourceUrl);
  const nameOf: Frame['nameOf'] = row => withAlias(row.archetypeLabel, catalog ? archetypeTitleAlias(row, catalog.items) : null);
  const frame: Frame = {
    item, name: nameOf(item), nameOf, where: FORMAT_LOCATIVE[item.format], ofFormat: FORMAT_GENITIVE[item.format],
    className: item.classKey ? STANDARD_META_CLASS_LABELS[item.classKey] : null,
    hsguru: source ? <a href={source} rel="noopener noreferrer">HSGuru</a> : 'HSGuru',
  };
  const date = seoDataDate(detail.updatedAt, Date.now());
  const facts = archetypeSeoFacts(item, catalog);
  return (
    <section className="archetype-seo-summary" aria-labelledby="archetype-seo-summary-title">
      <h2 id="archetype-seo-summary-title">
        Насколько силён {frame.name} {frame.where} {date && !date.stale ? 'сейчас' : 'по данным HSGuru'}
      </h2>
      <Lead detail={detail} frame={frame} />
      <Comparison facts={facts} frame={frame} />
      {facts.neighbours.length < MIN_NEIGHBOURS_WITHOUT_PRIMER ? <Primer /> : null}
      <p>
        Как читать эти цифры. Винрейт — доля побед в играх из выборки HSGuru, популярность — доля архетипа среди всех игр этого среза.{' '}
        {detail.minimumGames > 0 ? <>
          В каталог входят архетипы с выборкой от {detail.minimumGames} игр, поэтому у редких архетипов винрейт заметно скачет: опирайтесь на строки с большим числом игр.{' '}
        </> : null}
        Источник данных — {frame.hsguru}.
      </p>
      <p>Сборки и коды колод, история винрейта и разбор карт архетипа доступны по подписке HearthPulse — в этом тексте их нет.</p>
      <Neighbours facts={facts} frame={frame} />
      <p><a href={item.format === 'wild' ? '/standard/archetypes/?format=wild' : '/standard/archetypes/'}>Все архетипы {frame.ofFormat}</a></p>
    </section>
  );
}
