import { ARENA_CLASS_LABELS, type ArenaClassId } from '@/shared/arenaSynergyContract';
import { renderSeoDataTemplate, type SeoDataValues } from '@/src/seo/dataTemplate';
import { META_DESCRIPTION_MAX, META_TITLE_MAX } from '@/src/shared/seo/metaDescription';
import type { PublicTierlist } from './publicTierlistData';
import { arenaTierlistSeoValues } from './seoDataValues';

// A class page of the Arena tier list (`/tierlist/<class>/`, #617) is not in the registry
// (config/public-seo-pages.json) while it is noindex, so its formulas live here. The values are the
// ones the page prints: the data date and the sample of the pool («более 53 000 игр»). The page does
// not print the number of cards, so the snippet does not either. Data older than a week has no month
// (`seoDateValues`); without data of the class the text has no date and no sample. The brand is left
// out: «Охотник на демонов, ноябрь 2026» already takes 59 of the 60 characters.
const CLASS_TITLE = 'Тир-лист Арены Hearthstone: {label}[, {month}]';
// «Охотник на демонов», data a week old and a six-digit sample is the longest: 160 characters.
const CLASS_DESCRIPTION = '{label}: тир-лист карт Арены Hearthstone[{asOf}]. Тир, винрейт и частота выбора каждой карты'
  + '[, {games}]. Данные HSReplay.';
const NEUTRAL_TITLE = 'Нейтральные карты Арены Hearthstone: тир-лист[, {month}]';
const NEUTRAL_DESCRIPTION = 'Нейтральные карты Арены Hearthstone[{asOf}]: тир, винрейт и частота выбора каждой карты'
  + '[, {games}]. Данные HSReplay.';

const NEUTRAL_ID = 'any';

/** The class's name in the nominative («Охотник на демонов»), from its section id (`demon-hunter`). */
function className(classId: string): string {
  const key = classId.replace(/-/g, '').toUpperCase();
  return Object.hasOwn(ARENA_CLASS_LABELS, key) ? ARENA_CLASS_LABELS[key as ArenaClassId] : classId;
}

function render(template: string, values: SeoDataValues, maxLength: number): string {
  // Every token outside an optional group has a value, and the required part is short: the text always renders.
  return renderSeoDataTemplate(template, values, maxLength) ?? '';
}

/** Title and description of the class page of `classId` (`any` is the neutral cards' page). */
export function tierlistClassSeoText(pool: PublicTierlist | null, classId: string, now: number): { title: string; description: string } {
  const hasCards = pool?.classes.some(entry => entry.id === classId && entry.cards.length > 0) ?? false;
  const values: SeoDataValues = { ...(hasCards ? arenaTierlistSeoValues(pool, now) : null), label: className(classId) };
  const neutral = classId === NEUTRAL_ID;
  return {
    title: render(neutral ? NEUTRAL_TITLE : CLASS_TITLE, values, META_TITLE_MAX),
    description: render(neutral ? NEUTRAL_DESCRIPTION : CLASS_DESCRIPTION, values, META_DESCRIPTION_MAX),
  };
}
