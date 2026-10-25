import { Router } from 'express';
import type { RadarReport } from './contract.js';

export type RadarRouterDependencies = {
  /** Ошибки чтения логирует сервис (`onError`), по разу на попытку. */
  load: () => Promise<RadarReport>;
};

const PUBLIC_CACHE = 'public, max-age=300, stale-while-revalidate=1800';

/** Анонимный радар нерфов и баффов Стандарта: публичный прогноз, без данных зрителя. */
export function createRadarRouter(dependencies: RadarRouterDependencies): Router {
  const router = Router();

  router.get('/radar', async (_request, response) => {
    let report: RadarReport;
    try {
      report = await dependencies.load();
    } catch {
      response.set('Cache-Control', 'no-store');
      response.status(502).json({ error: 'Радар временно недоступен' });
      return;
    }
    response.set('Cache-Control', report.demo ? 'no-store' : PUBLIC_CACHE);
    response.json(report);
  });

  return router;
}
