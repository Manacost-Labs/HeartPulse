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
export type StatisticsEventQuery = { types: readonly GameEventType[]; since: string | null; limit: number; minSchemaVersion: 2 };
export type LoadStatisticsEvents = (userId: string, query: StatisticsEventQuery) => StatisticsEvent[];
/** Stored events per type from a schema version on, read without payloads. */
export type CountStatisticsEvents = (userId: string, types: readonly GameEventType[], minSchemaVersion: number)
  => Partial<Record<string, number>>;
