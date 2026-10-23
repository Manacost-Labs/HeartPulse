import { Router, type Request, type Response } from 'express';
import type { TrackerEventRepository } from './repository.js';

export type TrackerAccountDataDependencies = {
  userAuth: (request: Request) => { id: string } | null;
  repository: Pick<TrackerEventRepository, 'summarize' | 'eachEvent' | 'deleteAll'>;
  setPrivateNoStore: (response: Response) => void;
  /** Told after an account's events were deleted, so derived caches can drop that account. */
  onDeleted?: (userId: string) => void;
  now?: () => number;
};

/**
 * The player's own tracker data on the account page, signed in with the site
 * session: what is stored, a full export (right of access) and deletion of
 * everything (right to erasure). It does not depend on the statistics switch.
 */
export function createTrackerAccountDataRouter(dependencies: TrackerAccountDataDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const signedIn = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) response.status(401).json({ error: 'Требуется вход' });
    return user;
  };

  router.get('/account/tracker-data', (request, response) => {
    const user = signedIn(request, response);
    if (!user) return;
    try {
      response.json(dependencies.repository.summarize(user.id));
    } catch {
      response.status(503).json({ error: 'Не удалось загрузить данные приложения' });
    }
  });

  // Streamed row by row: an account may hold up to 100 000 events.
  router.get('/account/tracker-data/export', (request, response) => {
    const user = signedIn(request, response);
    if (!user) return;
    const day = new Date(now()).toISOString().slice(0, 10);
    response.set('Content-Type', 'application/json; charset=utf-8');
    response.set('Content-Disposition', `attachment; filename="hearthpulse-tracker-data-${day}.json"`);
    response.write(`{"exportedAt":${JSON.stringify(new Date(now()).toISOString())},"events":[`);
    let first = true;
    try {
      for (const event of dependencies.repository.eachEvent(user.id)) {
        response.write(`${first ? '' : ','}\n${JSON.stringify(event)}`);
        first = false;
      }
      response.end('\n]}\n');
    } catch {
      response.destroy();
    }
  });

  router.delete('/account/tracker-data', (request, response) => {
    const user = signedIn(request, response);
    if (!user) return;
    try {
      const deleted = dependencies.repository.deleteAll(user.id);
      dependencies.onDeleted?.(user.id);
      response.json({ deleted });
    } catch {
      response.status(503).json({ error: 'Не удалось удалить данные приложения' });
    }
  });

  return router;
}
