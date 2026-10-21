import { Router, type Response } from 'express';
import { shortPatchVersion, type PatchNotesArchive } from './contract.js';
import { patchNotesSummary, type PatchNotesSnapshot } from './service.js';

export type PatchNotesRouterDependencies = {
  load: () => Promise<PatchNotesSnapshot>;
  onError?: (error: unknown) => void;
};

const PUBLIC_CACHE = 'public, max-age=600, stale-while-revalidate=1800';

/** Anonymous patch notes: the archive of patches with card changes and one patch by version. */
export function createPatchNotesRouter(dependencies: PatchNotesRouterDependencies): Router {
  const router = Router();

  const read = async (response: Response) => {
    try {
      return await dependencies.load();
    } catch (error) {
      dependencies.onError?.(error);
      response.set('Cache-Control', 'no-store');
      response.status(502).json({ error: 'Архив патчей временно недоступен' });
      return null;
    }
  };

  router.get('/patch-notes', async (_request, response) => {
    const snapshot = await read(response);
    if (!snapshot) return;
    const body: PatchNotesArchive = {
      patches: snapshot.patches.filter(patch => patch.changeCount > 0).map(patchNotesSummary),
      updatedAt: snapshot.updatedAt,
    };
    response.set('Cache-Control', PUBLIC_CACHE);
    response.json(body);
  });

  router.get('/patch-notes/:version', async (request, response) => {
    const wanted = request.params.version === 'latest' ? 'latest' : shortPatchVersion(request.params.version);
    if (!wanted) {
      response.set('Cache-Control', 'no-store');
      return response.status(400).json({ error: 'Неизвестная версия патча' });
    }
    const snapshot = await read(response);
    if (!snapshot) return;
    const patch = wanted === 'latest'
      ? snapshot.patches.find(item => item.changeCount > 0)
      : snapshot.patches.find(item => item.version === wanted);
    if (!patch) {
      response.set('Cache-Control', 'public, max-age=300');
      return response.status(404).json({ error: 'Патч не найден' });
    }
    response.set('Cache-Control', PUBLIC_CACHE);
    return response.json(patch);
  });

  return router;
}
