import { archetypeLabel } from '../constructedArchetypes/public.js';
import { createRadarRouter } from './routes.js';
import { createRadarService } from './service.js';

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
};

/** `/api/radar` поверх одного проверенного снимка радара hs-data-api (или демо-прогона). */
export function createRadarApi({ baseUrl, fixture, archetypeSlug, loadArchetypeTranslations }: RadarApiOptions) {
  return createRadarRouter({
    load: createRadarService({
      radarUrl: `${baseUrl.replace(/\/+$/, '')}/v1/constructed/balance-radar?format=standard`,
      fixture,
      ttlMs: 15 * 60_000,
      loadArchetypeNamer: async () => {
        const translations = await loadArchetypeTranslations();
        return name => ({ slug: archetypeSlug(name), label: archetypeLabel(name, translations) });
      },
      onError: error => console.error('[radar] read failed:', error instanceof Error ? error.message : error),
    }).load,
  });
}
