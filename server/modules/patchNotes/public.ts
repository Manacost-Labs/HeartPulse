import { createPatchNotesRouter } from './routes.js';
import { createPatchNotesService, type PatchNotesServiceDependencies } from './service.js';
import { PatchArchetypeSnapshotStore, createPatchArchetypeRecorder } from './archetypeSnapshots.js';
import { official3702 } from './data/official3702.js';
import { PatchNotesLastGoodFile } from './lastGood.js';

export { createPatchNotesRouter, type PatchNotesRouterDependencies } from './routes.js';
export { createPatchNotesService, type PatchNotesServiceDependencies } from './service.js';
export { createBattlegroundCatalogLoader } from './battlegroundCatalog.js';

/**
 * `/api/patch-notes` routes over one cached, parsed copy of the hs-data-api
 * patch archive. With `stateDirectory` each patch lists the archetypes of the
 * day before it, and the last archive built in full is kept there: a restarted
 * server answers from it at once while the archive is rebuilt.
 * `recordArchetypesHourly` also records the day's catalogs every hour, so a
 * future patch finds its day without traffic.
 */
export function createPatchNotesApi(dependencies: PatchNotesServiceDependencies & {
  onError?: (error: unknown) => void; stateDirectory?: string; recordArchetypesHourly?: boolean;
}) {
  const { onError, stateDirectory, recordArchetypesHourly, ...service } = dependencies;
  const archetypeSnapshots = service.archetypeSnapshots
    ?? (stateDirectory ? new PatchArchetypeSnapshotStore({ stateDirectory }) : undefined);
  const lastGood = service.lastGood ?? (stateDirectory ? new PatchNotesLastGoodFile({ stateDirectory }) : undefined);
  if (recordArchetypesHourly && archetypeSnapshots) {
    const record = createPatchArchetypeRecorder({ ...service, archetypeSnapshots });
    setTimeout(record, 2 * 60_000).unref();
    setInterval(record, 60 * 60_000).unref();
  }
  const notes = createPatchNotesService({ officialArticles: [official3702], ...service, archetypeSnapshots, lastGood, ...(onError ? { onError } : {}) });
  return createPatchNotesRouter({ load: notes.load, withCardVersions: notes.withCardVersions, incomplete: notes.incomplete, ...(onError ? { onError } : {}) });
}
