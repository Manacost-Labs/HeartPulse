import 'server-only';
import { FIRST_PAINT_READ_BUDGET_MS } from './publicFirstPaintRead';
import { COLD_READ_WAIT_MS } from './firstPaintStore';
import { patchNotesReader } from './patchNotesStore';
import type { PublicPatchNotes } from './publicPatchNotesData';

export type { PublicPatchNotes } from './publicPatchNotesData';

/**
 * The patches for the first paint, read anonymously. A copy
 * the process already holds is used at once; a part never read before waits
 * at most `COLD_READ_WAIT_MS`, else it is `null` (`proxy.ts` has answered 503
 * by then) and the browser loads it. Patch notes are public, so nothing here
 * depends on the viewer.
 */
export function loadPublicPatchNotes(version: string | null): Promise<PublicPatchNotes> {
  return patchNotesReader()(version, Date.now() + FIRST_PAINT_READ_BUDGET_MS, Date.now() + COLD_READ_WAIT_MS);
}
