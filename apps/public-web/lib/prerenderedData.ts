import 'server-only';

/**
 * Seconds a prerendered data page (`/standard/meta/`, `/articles/`) is served
 * before Next regenerates it in the background. Keep the pages' literal
 * `export const revalidate = 300` equal: route segment config must be a literal.
 */
export const PRERENDERED_DATA_REVALIDATE_SECONDS = 300;

/**
 * Regeneration runs after the visitor already got the previous copy, so its
 * reads may wait far longer than a first paint would.
 */
export const PRERENDERED_DATA_READ_BUDGET_MS = 5_000;
