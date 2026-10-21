import 'server-only';
import type { PatchNotesDetail, PatchNotesSummary } from '@/src/modules/patchNotes/public';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS, readFirstPaintJson } from './publicFirstPaintRead';

export type PublicPatchNotes = { patch: PatchNotesDetail | null; archive: PatchNotesSummary[] | null };

function patchDetail(value: unknown): PatchNotesDetail | null {
  const patch = value as PatchNotesDetail | null;
  return patch && typeof patch.version === 'string' && typeof patch.title === 'string' && Array.isArray(patch.entries)
    ? patch : null;
}

function archive(value: unknown): PatchNotesSummary[] | null {
  const patches = (value as { patches?: unknown } | null)?.patches;
  return Array.isArray(patches) && patches.every(item => typeof item?.version === 'string') ? patches : null;
}

/**
 * The patch and the archive for the first paint, read anonymously within the
 * shared first-paint budget. A part that misses it is `null` and the browser
 * loads it; patch notes are public, so nothing here depends on the viewer.
 */
export async function loadPublicPatchNotes(version: string | null): Promise<PublicPatchNotes> {
  const deadline = Date.now() + FIRST_PAINT_READ_BUDGET_MS;
  const [patch, list] = await Promise.all([
    readFirstPaintJson(signal => fetchPublicExpress(`/api/patch-notes/${encodeURIComponent(version ?? 'latest')}`, signal), deadline),
    readFirstPaintJson(signal => fetchPublicExpress('/api/patch-notes', signal), deadline),
  ]);
  return { patch: patchDetail(patch), archive: archive(list) };
}
