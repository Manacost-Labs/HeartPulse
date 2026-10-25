import { archetypeLabel } from '../constructedArchetypes/public.js';
import { createStreamersRouter } from './routes.js';
import { createStreamersService } from './service.js';

export { createStreamersRouter, type StreamersRouterDependencies } from './routes.js';
export { createStreamersService, StreamerNotFoundError, type StreamersServiceDependencies } from './service.js';
export type * from './types.js';

export type StreamersApiOptions = {
  /** Корень hs-data-api (`HS_DATA_API_BASE_URL`). */
  baseUrl: string;
  /** Переводы имён архетипов, те же, что в мете. */
  loadArchetypeTranslations: () => Promise<Readonly<Record<string, string>>>;
};

/** `/api/streamers` и `/api/streamers/:slug` поверх hs-data-api `/v1/hsguru/streamers*`. */
export function createStreamersApi({ baseUrl, loadArchetypeTranslations }: StreamersApiOptions) {
  return createStreamersRouter(createStreamersService({
    baseUrl,
    loadNamer: async () => {
      const translations = await loadArchetypeTranslations();
      return name => archetypeLabel(name, translations);
    },
    onError: (key, error) => console.error(`[streamers] read ${key} failed:`, error instanceof Error ? error.message : error),
  }));
}
