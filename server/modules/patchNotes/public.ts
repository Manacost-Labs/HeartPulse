import { createPatchNotesRouter } from './routes.js';
import { createPatchNotesService, type PatchNotesServiceDependencies } from './service.js';
import { PatchArchetypeSnapshotStore, createPatchArchetypeRecorder } from './archetypeSnapshots.js';

export { createPatchNotesRouter, type PatchNotesRouterDependencies } from './routes.js';
export { createPatchNotesService, type PatchNotesServiceDependencies } from './service.js';
export { createBattlegroundCatalogLoader } from './battlegroundCatalog.js';

/**
 * `/api/patch-notes` routes over one cached, parsed copy of the hs-data-api
 * patch archive. With `archetypeSnapshotsDirectory` each patch lists the
 * archetypes of the day before it; `recordArchetypesHourly` also records the
 * day's catalogs every hour, so a future patch finds its day without traffic.
 */
export function createPatchNotesApi(dependencies: PatchNotesServiceDependencies & {
  onError?: (error: unknown) => void; archetypeSnapshotsDirectory?: string; recordArchetypesHourly?: boolean;
}) {
  const { onError, archetypeSnapshotsDirectory, recordArchetypesHourly, ...service } = dependencies;
  const archetypeSnapshots = service.archetypeSnapshots
    ?? (archetypeSnapshotsDirectory ? new PatchArchetypeSnapshotStore({ stateDirectory: archetypeSnapshotsDirectory }) : undefined);
  if (recordArchetypesHourly && archetypeSnapshots) {
    const record = createPatchArchetypeRecorder({ ...service, archetypeSnapshots });
    setTimeout(record, 2 * 60_000).unref();
    setInterval(record, 60 * 60_000).unref();
  }
  return createPatchNotesRouter({ load: createPatchNotesService({ ...service, archetypeSnapshots }).load, ...(onError ? { onError } : {}) });
}
