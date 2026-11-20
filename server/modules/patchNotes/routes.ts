import { Router, type Response } from 'express';
import { shortPatchVersion, type PatchNotesArchive, type PatchNotesDetail } from './contract.js';
import { patchNotesSummary, type PatchNotesSnapshot } from './service.js';

export type PatchNotesRouterDependencies = {
  load: () => Promise<PatchNotesSnapshot>;
  /** Adds before/after card pictures; without it entries keep the `null` pair of the snapshot. */
  withCardVersions?: (snapshot: PatchNotesSnapshot, patches: PatchNotesDetail[]) => Promise<PatchNotesDetail[]>;
  /** True while the pictures or cards of an answer are still being read; the answer is then cached only briefly. */
  incomplete?: () => boolean;
  /** True for a snapshot that is the stored copy of an earlier process: its answers, a 404 included, are cached only briefly. */
  restored?: (snapshot: PatchNotesSnapshot) => boolean;
  onError?: (error: unknown) => void;
};

const PUBLIC_CACHE = 'public, max-age=600, stale-while-revalidate=1800';
const INCOMPLETE_CACHE = 'public, max-age=10';
/** How many of the newest patches with card changes `/patch-notes/recent` serves. */
const RECENT_PATCHES = 2;

/** Anonymous patch notes: the archive of patches with card changes and one patch by version. */
export function createPatchNotesRouter(dependencies: PatchNotesRouterDependencies): Router {
  const router = Router();
  const cacheOf = (snapshot: PatchNotesSnapshot) => (dependencies.incomplete?.() || dependencies.restored?.(snapshot) ? INCOMPLETE_CACHE : PUBLIC_CACHE);

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
    response.set('Cache-Control', dependencies.restored?.(snapshot) ? INCOMPLETE_CACHE : PUBLIC_CACHE);
    response.json(body);
  });

  const withPictures = async (snapshot: PatchNotesSnapshot, patches: PatchNotesDetail[]) => {
    try {
      return await (dependencies.withCardVersions?.(snapshot, patches) ?? patches);
    } catch (error) {
      dependencies.onError?.(error);
      return patches;
    }
  };

  // The patch page: the newest patches with card changes, each with its before/after pictures.
  router.get('/patch-notes/recent', async (_request, response) => {
    const snapshot = await read(response);
    if (!snapshot) return;
    const patches = snapshot.patches.filter(patch => patch.changeCount > 0).slice(0, RECENT_PATCHES);
    const withCards = await withPictures(snapshot, patches);
    response.set('Cache-Control', cacheOf(snapshot));
    response.json({ patches: withCards, updatedAt: snapshot.updatedAt });
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
      // A patch released after the stored copy was made is not known until the archive is rebuilt.
      response.set('Cache-Control', dependencies.restored?.(snapshot) ? 'no-store' : 'public, max-age=300');
      return response.status(404).json({ error: 'Патч не найден' });
    }
    const [withCards] = await withPictures(snapshot, [patch]);
    response.set('Cache-Control', cacheOf(snapshot));
    return response.json(withCards);
  });

  return router;
}
