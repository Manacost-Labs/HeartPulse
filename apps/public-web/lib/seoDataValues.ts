import type { ArchetypeCatalog, ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import { standardMetaPeriodLabel } from '@/src/features/standardMetaFilterModel';
import type { StandardMetaTeaserSeed } from '@/src/features/standardMetaTeaser';
import { renderSeoDataTemplate, type SeoDataValues } from '@/src/seo/dataTemplate';
import { fitMetaDescription, META_DESCRIPTION_MAX, META_TITLE_MAX } from '@/src/shared/seo/metaDescription';
import { pluralRu } from '@/src/shared/text/pluralRu';
import { isStandardMetaPeriod } from '@/shared/standardMetaPeriods';
import { seoDataDate, seoDateValues } from './seoDataDate';

/**
 * A meta row is called the leader in a snippet only above this many games: a
 * winrate of a few hundred games is noise (docs/specs/seo-entity-indexing.md).
 */
export const SEO_LEADER_MIN_GAMES = 1000;

// The numbers of a snippet read the way the page itself prints them.
const percent = (value: number, maximumFractionDigits: number) =>
  `${value.toLocaleString('ru-RU', { maximumFractionDigits })}%`;

/**
 * Values of `/standard/meta`'s data templates from the teaser the page shows,
 * or `null` (the static text) without a teaser or a readable date.
 */
export function standardMetaSeoValues(seed: StandardMetaTeaserSeed | null, now: number): SeoDataValues | null {
  const date = seed && seoDataDate(seed.data.updatedAt, now);
  if (!seed || !date) return null;
  const leader = seed.data.items.find(item => (item.games ?? 0) >= SEO_LEADER_MIN_GAMES && item.winrate !== null);
  return {
    ...seoDateValues(date),
    leader: leader ? `${leader.archetypeLabel}, ${percent(leader.winrate!, 2)} побед` : null,
  };
}

const FORMAT_GENITIVE = { standard: 'Стандарта', wild: 'Вольного формата' } as const;
const FORMAT_LOCATIVE = { standard: 'в Стандарте', wild: 'в Вольном формате' } as const;

/** Values of `/standard/archetypes`' data templates from the catalog teaser the page shows. */
export function archetypeCatalogSeoValues(catalog: ArchetypeCatalog | null, now: number): SeoDataValues | null {
  const date = catalog && seoDataDate(catalog.updatedAt, now);
  if (!catalog || !date) return null;
  const count = catalog.items.length;
  return {
    ...seoDateValues(date),
    archetypes: count > 0 ? `${count} ${pluralRu(count, 'архетип', 'архетипа', 'архетипов')}` : null,
    format: FORMAT_GENITIVE[catalog.format],
  };
}

/** The HSGuru window of an archetype page: the detail answer names it in `period` or, as `black_empire_ban`, in `patch`. */
function detailPeriodLabel(detail: Pick<ArchetypeDetail, 'period' | 'patch'>): string | null {
  const period = detail.period ?? (isStandardMetaPeriod(detail.patch) ? detail.patch : null);
  if (period) return standardMetaPeriodLabel(period);
  return detail.patch ? `Патч ${detail.patch}` : null;
}

/** Values of an archetype page's title and description templates (publicArchetypeRoute.ts). */
export function archetypeDetailSeoValues(detail: ArchetypeDetail, now: number): SeoDataValues {
  const { item } = detail;
  const date = seoDataDate(detail.updatedAt, now);
  return {
    ...(date ? seoDateValues(date) : {}),
    label: item.archetypeLabel,
    format: FORMAT_LOCATIVE[item.format],
    winrate: item.winrate === null ? null : percent(item.winrate, 1),
    games: item.games > 0 ? `${item.games.toLocaleString('ru-RU')} ${pluralRu(item.games, 'игра', 'игры', 'игр')}` : null,
    period: detailPeriodLabel(detail),
  };
}

// An archetype page is not in the registry (config/public-seo-pages.json), so its
// formulas live here (used by publicArchetypeRoute.ts): the name and the numbers
// come from its own teaser. The last optional group goes
// first when the text is too long: the brand, then the month; the period, then
// the games, then the winrate, then the date.
const TITLE_TEMPLATE = '{label} — колода Hearthstone[, {month}][ | HearthPulse]';
const DESCRIPTION_TEMPLATE = '{label} {format} (хс)[{asOf}][: винрейт {winrate}][, {games}][, период «{period}»]. Данные HSGuru.';
// The longest label that still leaves room for the rest of a title or a description.
const TITLE_LABEL_MAX = 40;
const DESCRIPTION_LABEL_MAX = 80;

/** Renders `template`; a name too long for it is cut at a word boundary, so the rest of the text survives. */
function fitWithLabel(template: string, values: SeoDataValues, maxLength: number, labelMax: number): string {
  const label = String(values.label);
  return renderSeoDataTemplate(template, values, maxLength)
    ?? renderSeoDataTemplate(template, { ...values, label: fitMetaDescription(label, labelMax) }, maxLength)
    ?? fitMetaDescription(label, maxLength);
}

/** Title and description of an archetype page: the data date, winrate and games of its teaser. */
export function archetypeDetailSeoText(detail: ArchetypeDetail, now: number): { title: string; description: string } {
  const values = archetypeDetailSeoValues(detail, now);
  return {
    title: fitWithLabel(TITLE_TEMPLATE, values, META_TITLE_MAX, TITLE_LABEL_MAX),
    description: fitWithLabel(DESCRIPTION_TEMPLATE, values, META_DESCRIPTION_MAX, DESCRIPTION_LABEL_MAX),
  };
}
