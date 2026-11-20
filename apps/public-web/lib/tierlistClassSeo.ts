import type { SeoDataValues } from '@/src/seo/dataTemplate';
import { seoPageForExactPath, seoPageText } from '@/src/seo/registry';
import type { PublicTierlist } from './publicTierlistData';
import { arenaTierlistSeoValues } from './seoDataValues';
import { tierlistClassPath } from './tierlistClassPages';

// A class page of the Arena tier list (`/tierlist/<class>/`, #617) takes its title and description from its record in
// the registry (config/public-seo-pages.json, #668), one per class, like any page of static.xml. The data values are
// the ones the page prints: the data date and the sample of the pool («более 53 000 игр»). The page does not print
// the number of cards, so the snippet does not either. Data older than a week has no month (`seoDateValues`); without
// cards of the class the page keeps the record's static text.

const NEUTRAL_ID = 'any';

/**
 * The Russian name of each section of a class page, by section id (`any` is the neutral cards): the breadcrumb names
 * the class from here, not from the loaded pool, so a page without data is still about its class.
 * The names are the pool's own (`/api/tierlist/public` `classes[].name`).
 */
const CLASS_NAMES: Readonly<Record<string, string>> = {
  'death-knight': 'Рыцарь смерти', 'demon-hunter': 'Охотник на демонов', druid: 'Друид', hunter: 'Охотник', mage: 'Маг',
  paladin: 'Паладин', priest: 'Жрец', rogue: 'Разбойник', shaman: 'Шаман', warlock: 'Чернокнижник', warrior: 'Воин',
  [NEUTRAL_ID]: 'Нейтральные',
};

/** The class's name in the nominative («Охотник на демонов»), from its section id (`demon-hunter`). */
export function tierlistClassName(classId: string): string {
  return Object.hasOwn(CLASS_NAMES, classId) ? CLASS_NAMES[classId] : classId;
}

/** Values of the registry's data templates for the class page of `classId`; `null` when the pool has no cards of it. */
export function tierlistClassSeoValues(pool: PublicTierlist | null, classId: string, now: number): SeoDataValues | null {
  const hasCards = pool?.classes.some(entry => entry.id === classId && entry.cards.length > 0) ?? false;
  return hasCards ? arenaTierlistSeoValues(pool, now) : null;
}

/** Title and description of the class page of `classId` (`any` is the neutral cards' page). */
export function tierlistClassSeoText(pool: PublicTierlist | null, classId: string, now: number): { title: string; description: string } {
  const path = tierlistClassPath(classId);
  const page = seoPageForExactPath(path);
  if (!page) throw new Error(`Missing SEO contract for ${path}`);
  return seoPageText(page, tierlistClassSeoValues(pool, classId, now));
}
