/**
 * A stored tracker event as this module reads it. The shape is the tracker
 * ingestion module's `TrackerProfileEvent`; composition passes those events in,
 * so this module never reads the ingestion table itself.
 */
export type StatisticsEvent = {
  eventId: string;
  type: string;
  schemaVersion: number;
  occurredAt: string;
  payload: Record<string, unknown>;
};

/** Event types that carry games or runs; other tracker events are ignored by the statistics. */
export const GAME_EVENT_TYPES = ['battlegrounds_match', 'constructed_match', 'arena_match', 'arena_run'] as const;
export type GameEventType = typeof GAME_EVENT_TYPES[number];

/** The statistics read schema version 2 only, so older payloads are never parsed. */
export type StatisticsEventQuery = {
  types: readonly GameEventType[];
  since: string | null;
  /** Exclusive upper bound (ISO time); the public copy stops at the start of the current UTC day. */
  until?: string | null;
  limit: number;
  minSchemaVersion: 2;
};
export type LoadStatisticsEvents = (userId: string, query: StatisticsEventQuery) => StatisticsEvent[];
/**
 * Stored events of one type from a schema version on, per value of one
 * top-level payload field (`format`, `duos`); events without the field, such
 * as those stored with a `statisticsError`, are not counted. A JSON boolean
 * groups as `1`/`0`; `until` (ISO) is an exclusive bound.
 */
export type CountStatisticsEventsByField = (userId: string, type: GameEventType, minSchemaVersion: number, field: string, until?: string)
  => Partial<Record<string, number>>;
