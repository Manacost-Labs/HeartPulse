export const TRACKER_EVENT_TYPES = [
  'constructed_match',
  'arena_match',
  'arena_run',
  'arena_draft_pick',
  'battlegrounds_match',
  'collection_snapshot',
] as const;

export type TrackerEventType = typeof TRACKER_EVENT_TYPES[number];
export type TrackerProfileEvent = {
  eventId: string;
  type: TrackerEventType;
  schemaVersion: 1;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export const TRACKER_MAX_BATCH_EVENTS = 50;
export const TRACKER_MAX_BATCH_BYTES = 5 * 1024 * 1024;
const MAX_EVENT_BYTES = 512 * 1024;
const MAX_COLLECTION_EVENT_BYTES = 4 * 1024 * 1024;
const MAX_NODES = 100_000;
const MAX_DEPTH = 32;
const MAX_STRING_LENGTH = 8_192;
const MAX_OBJECT_PROPERTIES = 128;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/;

const listLimits: Partial<Record<TrackerEventType, Array<[string, number]>>> = {
  constructed_match: [
    ['playerMulligan.initial', 10],
    ['playerMulligan.kept', 10],
    ['playerMulligan.replaced', 10],
    ['playerMulligan.after', 10],
    ['opponentDeck.observedCards', 64],
  ],
  arena_match: [
    ['playerMulligan.initial', 10],
    ['playerMulligan.kept', 10],
    ['playerMulligan.replaced', 10],
    ['playerMulligan.after', 10],
  ],
  arena_draft_pick: [['offeredCardIds', 8]],
  arena_run: [['finalDeckCardIds', 40]],
  battlegrounds_match: [['finalBoard.minions', 7]],
  collection_snapshot: [['cards', 20_000]],
};

export type TrackerEventValidation =
  | { ok: true; event: TrackerProfileEvent }
  | { ok: false; eventId: string | null; code: 'INVALID_EVENT' | 'EVENT_LIMIT_EXCEEDED' };

export function validateTrackerProfileEvent(input: unknown): TrackerEventValidation {
  if (!isRecord(input)) return invalid(null);
  const eventId = typeof input.eventId === 'string' && UUID_PATTERN.test(input.eventId)
    ? input.eventId.toLowerCase()
    : null;
  if (!eventId) return invalid(null);
  const type = typeof input.type === 'string' && TRACKER_EVENT_TYPES.includes(input.type as TrackerEventType)
    ? input.type as TrackerEventType
    : null;
  if (
    !type
    || input.schemaVersion !== 1
    || typeof input.occurredAt !== 'string'
    || input.occurredAt.length > 64
    || !ISO_TIMESTAMP_PATTERN.test(input.occurredAt)
    || !Number.isFinite(Date.parse(input.occurredAt))
    || !isRecord(input.payload)
  ) {
    return invalid(eventId);
  }

  const payloadJson = safeStringify(input.payload);
  const maximumBytes = type === 'collection_snapshot'
    ? MAX_COLLECTION_EVENT_BYTES
    : MAX_EVENT_BYTES;
  if (
    payloadJson === null
    || Buffer.byteLength(payloadJson, 'utf8') > maximumBytes
    || !isBoundedStructure(input.payload)
    || !hasBoundedLists(type, input.payload)
  ) {
    return { ok: false, eventId, code: 'EVENT_LIMIT_EXCEEDED' };
  }

  return {
    ok: true,
    event: {
      eventId,
      type,
      schemaVersion: 1,
      occurredAt: new Date(input.occurredAt).toISOString(),
      payload: input.payload,
    },
  };
}

const invalid = (eventId: string | null): TrackerEventValidation => ({
  ok: false,
  eventId,
  code: 'INVALID_EVENT',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function isBoundedStructure(root: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current) break;
    visited += 1;
    if (visited > MAX_NODES || current.depth > MAX_DEPTH) return false;
    if (typeof current.value === 'string' && current.value.length > MAX_STRING_LENGTH) return false;
    if (Array.isArray(current.value)) {
      if (current.value.length > 20_000) return false;
      for (const value of current.value) pending.push({ value, depth: current.depth + 1 });
    } else if (isRecord(current.value)) {
      const entries = Object.entries(current.value);
      if (entries.length > MAX_OBJECT_PROPERTIES) return false;
      for (const [key, value] of entries) {
        if (key.length > 128) return false;
        pending.push({ value, depth: current.depth + 1 });
      }
    }
  }
  return true;
}

function hasBoundedLists(type: TrackerEventType, payload: Record<string, unknown>): boolean {
  for (const [path, maximum] of listLimits[type] ?? []) {
    const value = resolvePath(payload, path);
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length > maximum) return false;
    if (value.some(item => cardIdFrom(item)?.length > 64)) return false;
  }
  return true;
}

function resolvePath(payload: Record<string, unknown>, path: string): unknown {
  let current: unknown = payload;
  for (const segment of path.split('.')) {
    if (!isRecord(current) || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

function cardIdFrom(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return isRecord(value) && typeof value.cardId === 'string' ? value.cardId : null;
}
