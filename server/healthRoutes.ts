import express from 'express';
import type { DataHealthReport } from './health.js';

interface HealthRouterOptions {
  getDataHealth: () => DataHealthReport;
  getRelease?: () => string;
  getUptimeSeconds?: () => number;
  now?: () => Date;
}

export function createHealthRouter(options: HealthRouterOptions): express.Router {
  const router = express.Router();
  const now = options.now ?? (() => new Date());

  router.get('/live', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'alive',
      checkedAt: now().toISOString(),
      uptimeSeconds: Math.floor(options.getUptimeSeconds?.() ?? process.uptime()),
      release: options.getRelease?.() || 'development',
    });
  });

  router.get('/ready', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const data = options.getDataHealth();
    res.status(data.ready ? 200 : 503).json({
      status: data.ready ? 'ready' : 'not-ready',
      checkedAt: data.checkedAt,
      dataStatus: data.status,
      datasets: data.datasets,
    });
  });

  router.get('/data', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const data = options.getDataHealth();
    res.status(data.fresh ? 200 : 503).json(data);
  });

  return router;
}
