import { createPatchNotesRouter } from './routes.js';
import { createPatchNotesService, type PatchNotesServiceDependencies } from './service.js';

export { createPatchNotesRouter, type PatchNotesRouterDependencies } from './routes.js';
export { createPatchNotesService, type PatchNotesServiceDependencies } from './service.js';
export { createBattlegroundCatalogLoader } from './battlegroundCatalog.js';

/** `/api/patch-notes` routes over one cached, parsed copy of the hs-data-api patch archive. */
export function createPatchNotesApi(dependencies: PatchNotesServiceDependencies & { onError?: (error: unknown) => void }) {
  const { onError, ...service } = dependencies;
  return createPatchNotesRouter({ load: createPatchNotesService(service).load, ...(onError ? { onError } : {}) });
}
