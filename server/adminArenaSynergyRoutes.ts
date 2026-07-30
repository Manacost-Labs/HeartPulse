import { Router, type RequestHandler, type Response } from 'express';
import {
  ARENA_CLASS_IDS,
  type ArenaClassId,
  type ArenaSynergyPayload,
} from '../shared/arenaSynergyContract.js';

export type AdminArenaSynergyDependencies = {
  adminGuard: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  loadAnalysis: (
    className: ArenaClassId,
    options: { forceRefresh: boolean },
  ) => Promise<ArenaSynergyPayload | unknown>;
  onError?: (error: unknown) => void;
};

export function createAdminArenaSynergyRouter(
  dependencies: AdminArenaSynergyDependencies,
): Router {
  const router = Router();
  router.use('/admin/arena-synergies', dependencies.adminGuard, (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  });

  router.get('/admin/arena-synergies', async (request, response) => {
    const query = request.query.class;
    const className = query == null || query === '' ? 'ALL' : query;
    const forceRefresh = request.query.refresh === '1';
    if (
      typeof className !== 'string'
      || !ARENA_CLASS_IDS.includes(className.toUpperCase() as ArenaClassId)
    ) {
      return response.status(400).json({
        code: 'INVALID_ARENA_CLASS',
        error: 'Неизвестный класс Арены',
      });
    }

    try {
      return response.json(await dependencies.loadAnalysis(
        className.toUpperCase() as ArenaClassId,
        { forceRefresh },
      ));
    } catch (error) {
      dependencies.onError?.(error);
      return response.status(502).json({
        code: 'ARENA_SYNERGIES_UNAVAILABLE',
        error: 'Не удалось рассчитать сочетания Арены',
      });
    }
  });

  return router;
}
