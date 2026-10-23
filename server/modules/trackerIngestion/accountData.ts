import { setImmediate as nextTurn } from 'node:timers/promises';
import { Router, type Request, type Response } from 'express';
import type { TrackerEventRepository } from './repository.js';

export type TrackerAccountDataDependencies = {
  userAuth: (request: Request) => { id: string } | null;
  repository: Pick<TrackerEventRepository, 'summarize' | 'exportPage' | 'deleteAll'>;
  setPrivateNoStore: (response: Response) => void;
  /** Told after an account's events were deleted, so derived caches can drop that account. */
  onDeleted?: (userId: string) => void;
  now?: () => number;
};

// One export page: few enough rows and bytes that a page never holds the loop for long.
const EXPORT_PAGE_ROWS = 200;
const EXPORT_PAGE_BYTES = 1024 * 1024;

/** Writes a chunk and, when the socket buffer is full, waits until it drains or the client leaves. */
async function writeChunk(response: Response, chunk: string): Promise<void> {
  if (response.write(chunk)) return;
  await new Promise<void>(resolve => {
    const done = () => {
      response.off('drain', done);
      response.off('close', done);
      resolve();
    };
    response.on('drain', done);
    response.on('close', done);
  });
}

/**
 * The player's own tracker data on the account page, signed in with the site
 * session: what is stored, a full export (right of access) and deletion of
 * everything (right to erasure). It does not depend on the statistics switch.
 */
export function createTrackerAccountDataRouter(dependencies: TrackerAccountDataDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const exporting = new Set<string>();
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

  // An account may hold up to 100 000 events of up to a few MiB each, so the
  // export reads them page by page, honours backpressure and yields between
  // pages; one export per account runs at a time.
  router.get('/account/tracker-data/export', async (request, response) => {
    const user = signedIn(request, response);
    if (!user) return;
    if (exporting.has(user.id)) {
      response.status(429).json({ error: 'Выгрузка уже идёт' });
      return;
    }
    exporting.add(user.id);
    try {
      const day = new Date(now()).toISOString().slice(0, 10);
      response.set('Content-Type', 'application/json; charset=utf-8');
      response.set('Content-Disposition', `attachment; filename="hearthpulse-tracker-data-${day}.json"`);
      await writeChunk(response, `{"exportedAt":${JSON.stringify(new Date(now()).toISOString())},"events":[`);
      let first = true;
      let page = dependencies.repository.exportPage(user.id, null, EXPORT_PAGE_ROWS, EXPORT_PAGE_BYTES);
      for (;;) {
        for (const row of page.rows) {
          if (response.destroyed) return;
          await writeChunk(response, `${first ? '' : ','}\n${row}`);
          first = false;
        }
        if (!page.next) break;
        await nextTurn();
        if (response.destroyed) return;
        page = dependencies.repository.exportPage(user.id, page.next, EXPORT_PAGE_ROWS, EXPORT_PAGE_BYTES);
      }
      response.end('\n]}\n');
    } catch {
      response.destroy();
    } finally {
      exporting.delete(user.id);
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
