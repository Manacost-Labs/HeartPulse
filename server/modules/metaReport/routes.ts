import { Router, type Response } from 'express';
import type { MetaReportSnapshot } from './contract.js';

/** A calendar date, `YYYY-MM-DD` (`2026-02-30` is not one): the rule of `shared/metaReportDate.ts`, which modules may not import. */
function isMetaReportDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// The list changes once a week; a stored snapshot never changes.
const LIST_CACHE = 'public, max-age=300';
const SNAPSHOT_CACHE = 'public, max-age=3600';

function unavailable(response: Response, onError: ((error: unknown) => void) | undefined, error: unknown) {
  onError?.(error);
  response.set('Cache-Control', 'no-store').status(503).json({ error: 'Meta reports temporarily unavailable' });
}

/**
 * The open meta report archive (docs/specs/meta-report-snapshots.md, «HTTP»):
 * `GET /api/meta-reports` lists the snapshot dates, newest first, and
 * `GET /api/meta-reports/:date` answers one stored snapshot as it was recorded.
 * Every field of a snapshot is already one a guest reads without a
 * subscription, so the routes need no access guard.
 */
export function createMetaReportRouter(snapshots: {
  list: () => string[];
  get: (date: string) => MetaReportSnapshot | null;
  onError?: (error: unknown) => void;
}): Router {
  const router = Router({ caseSensitive: true, strict: true });

  router.get('/meta-reports', (_request, response) => {
    let dates: string[];
    try {
      dates = snapshots.list();
    } catch (error) {
      return unavailable(response, snapshots.onError, error);
    }
    response.set('Cache-Control', LIST_CACHE).json({ dates });
  });

  router.get('/meta-reports/:date', (request, response) => {
    const { date } = request.params;
    if (!isMetaReportDate(date)) {
      return response.set('Cache-Control', 'no-store').status(404).json({ error: 'Meta report not found' });
    }
    let snapshot: MetaReportSnapshot | null;
    try {
      snapshot = snapshots.get(date);
    } catch (error) {
      return unavailable(response, snapshots.onError, error);
    }
    if (!snapshot) return response.set('Cache-Control', 'no-store').status(404).json({ error: 'Meta report not found' });
    response.set('Cache-Control', SNAPSHOT_CACHE).json(snapshot);
  });

  return router;
}
