import { fetchWithDeadline } from '../../shared/http/fetchWithDeadline';
import type { PatchNotesArchive, PatchNotesSummary } from '../../modules/patchNotes/public';

export type LatestPatch = { version: string; publishedAt: string; checkedAt: number };

/** The badge is a hint: a slow archive is given up rather than kept open. */
const BADGE_DEADLINE_MS = 10_000;

/** The newest patch of the archive with a publication date. */
export function latestPatch(patches: readonly PatchNotesSummary[], checkedAt: number): LatestPatch | null {
  let latest: LatestPatch | null = null;
  for (const { version, publishedAt } of patches) {
    if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) continue;
    if (!latest || Date.parse(publishedAt) > Date.parse(latest.publishedAt)) latest = { version, publishedAt, checkedAt };
  }
  return latest;
}

/** The newest patch of the public archive, or null when it cannot be read. */
export async function readLatestPatch(signal: AbortSignal): Promise<LatestPatch | null> {
  const response = await fetchWithDeadline('/api/patch-notes', { credentials: 'omit', signal, deadlineMs: BADGE_DEADLINE_MS });
  if (!response.ok) return null;
  const archive = await response.json() as PatchNotesArchive;
  return Array.isArray(archive?.patches) ? latestPatch(archive.patches, Date.now()) : null;
}
