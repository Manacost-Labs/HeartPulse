import { Router, type Response } from 'express';
import type { ApplicationAuthManager } from '../applicationAuth/public.js';
import {
  TRACKER_MAX_BATCH_EVENTS,
  TRACKER_MAX_EVENTS_PER_ACCOUNT,
  validateTrackerProfileEvent,
  type TrackerPayloadValidator,
  type TrackerProfileEvent,
} from './model.js';
import type { TrackerEventRepository } from './repository.js';

type TrackerIngestionRouterDependencies = {
  accessTokens: Pick<ApplicationAuthManager, 'authenticate'>;
  repository: TrackerEventRepository;
  setPrivateNoStore: (response: Response) => void;
  validatePayload?: TrackerPayloadValidator;
  /** Told after new events of an account were stored, so derived caches can drop that account. */
  onStored?: (userId: string) => void;
  maxEventsPerAccount?: number;
  now?: () => number;
};

const apiError = (code: string, message: string) => ({ error: { code, message } });

function bearerToken(authorization: unknown): string {
  const value = String(authorization ?? '').trim();
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

/** Accepts bounded, versioned IceCrow profile events and acknowledges duplicates idempotently. */
export function createTrackerIngestionRouter(
  dependencies: TrackerIngestionRouterDependencies,
): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  router.post('/tracker/events/batch', (request, response) => {
    dependencies.setPrivateNoStore(response);
    response.set('Pragma', 'no-cache');
    const authenticated = dependencies.accessTokens.authenticate(
      bearerToken(request.headers.authorization),
      ['tracker.write'],
    );
    if (!authenticated) {
      response.set('WWW-Authenticate', 'Bearer realm="HearthPulse Tracker"');
      return response.status(401).json(apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired'));
    }
    if (authenticated === 'FORBIDDEN') {
      return response.status(403).json(apiError('INSUFFICIENT_SCOPE', 'Access token does not grant tracker.write'));
    }

    const events = request.body?.events;
    if (!Array.isArray(events) || events.length < 1 || events.length > TRACKER_MAX_BATCH_EVENTS) {
      return response.status(400).json(apiError('INVALID_BATCH', 'Batch must contain 1 to 50 events'));
    }

    const valid: TrackerProfileEvent[] = [];
    const rejected: Array<{ eventId: string; code: string; field?: string }> = [];
    const warnings: Array<{ eventId: string; code: 'INVALID_STATISTICS'; field: string }> = [];
    const receivedAt = now();
    for (const input of events) {
      const result = validateTrackerProfileEvent(input, dependencies.validatePayload, receivedAt);
      if (result.ok === true) {
        valid.push(result.event);
        if (result.warning) warnings.push({ eventId: result.event.eventId, code: 'INVALID_STATISTICS', field: result.warning });
      } else if (result.eventId) {
        rejected.push({ eventId: result.eventId, code: result.code, ...(result.field ? { field: result.field } : {}) });
      } else {
        return response.status(400).json(apiError('INVALID_EVENT_ID', 'Every event needs a valid eventId'));
      }
    }

    const refused = new Set(dependencies.repository.acknowledge(authenticated.userId, valid, receivedAt,
      dependencies.maxEventsPerAccount ?? TRACKER_MAX_EVENTS_PER_ACCOUNT));
    for (const eventId of refused) rejected.push({ eventId, code: 'QUOTA_EXCEEDED' });
    if (valid.length > refused.size) dependencies.onStored?.(authenticated.userId);
    const kept = warnings.filter(warning => !refused.has(warning.eventId));
    return response.status(202).json({
      accepted: valid.filter(event => !refused.has(event.eventId)).map(event => event.eventId),
      rejected,
      // Only present when needed, so a version 1 client sees the response it always did.
      ...(kept.length ? { warnings: kept } : {}),
    });
  });
  return router;
}
