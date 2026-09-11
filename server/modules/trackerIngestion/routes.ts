import { Router, type Response } from 'express';
import type { ApplicationAuthManager } from '../applicationAuth/public.js';
import {
  TRACKER_MAX_BATCH_EVENTS,
  validateTrackerProfileEvent,
  type TrackerProfileEvent,
} from './model.js';
import type { TrackerEventRepository } from './repository.js';

type TrackerIngestionRouterDependencies = {
  accessTokens: Pick<ApplicationAuthManager, 'authenticate'>;
  repository: TrackerEventRepository;
  setPrivateNoStore: (response: Response) => void;
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
    const rejected: Array<{ eventId: string; code: string }> = [];
    for (const input of events) {
      const result = validateTrackerProfileEvent(input);
      if (result.ok === true) {
        valid.push(result.event);
      } else if (result.eventId) {
        rejected.push({ eventId: result.eventId, code: result.code });
      } else {
        return response.status(400).json(apiError('INVALID_EVENT_ID', 'Every event needs a valid eventId'));
      }
    }

    dependencies.repository.acknowledge(authenticated.userId, valid, now());
    return response.status(202).json({
      accepted: valid.map(event => event.eventId),
      rejected,
    });
  });
  return router;
}
