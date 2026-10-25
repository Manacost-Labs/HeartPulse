import { archetypeLabel } from '../constructedArchetypes/public.js';
import { createRadarRouter } from './routes.js';
import { createRadarService } from './service.js';
import { createRadarLocalizer } from './localize.js';

export { createRadarRouter, type RadarRouterDependencies } from './routes.js';
export { createRadarService, type RadarServiceDependencies } from './service.js';

export type RadarApiOptions = {
  /** Корень hs-data-api (`HS_DATA_API_BASE_URL`). */
  baseUrl: string;
  /** `RADAR_FIXTURE=1`: встроенный демо-прогон вместо hs-data-api. */
  fixture: boolean;
  /** Slug страницы архетипа сайта по имени HSGuru. */
  archetypeSlug: (name: string) => string;
  /** Переводы имён архетипов, те же, что в мете. */
  loadArchetypeTranslations: () => Promise<Readonly<Record<string, string>>>;
  /** Каталог карт с `name.en` и `name.ru`: английские имена карт в текстах модели заменяются русскими. */
  loadCards?: () => Promise<Iterable<Record<string, unknown>>>;
};

/** `/api/radar` поверх одного проверенного снимка радара hs-data-api (или демо-прогона). */
export function createRadarApi({ baseUrl, fixture, archetypeSlug, loadArchetypeTranslations, loadCards }: RadarApiOptions) {
  return createRadarRouter({
    load: createRadarService({
      radarUrl: `${baseUrl.replace(/\/+$/, '')}/v1/constructed/balance-radar?format=standard`,
      backtestUrl: `${baseUrl.replace(/\/+$/, '')}/v1/constructed/balance-radar/backtest`,
      fixture,
      // hs-data-api пересчитывает радар по расписанию; пять минут — самое долгое, сколько страница отстаёт от нового прогона.
      ttlMs: 5 * 60_000,
      loadNaming: async () => {
        const [translations, cards] = await Promise.all([loadArchetypeTranslations(), loadCards?.().catch(() => []) ?? []]);
        return {
          nameArchetype: name => ({ slug: archetypeSlug(name), label: archetypeLabel(name, translations) }),
          localizeFor: cardIds => createRadarLocalizer({ archetypes: translations, cards, cardIds }),
        };
      },
      onError: error => console.error('[radar] read failed:', error instanceof Error ? error.message : error),
    }).load,
  });
}
