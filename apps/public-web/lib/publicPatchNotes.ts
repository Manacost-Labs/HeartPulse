import 'server-only';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS } from './publicFirstPaintRead';
import { createPatchNotesReader, type PublicPatchNotes } from './publicPatchNotesData';

export type { PublicPatchNotes } from './publicPatchNotesData';

// One cache per Next process (`next start` runs one); it starts empty after a restart.
const readPatchNotes = createPatchNotesReader({ request: (path, signal) => fetchPublicExpress(path, signal) });

/**
 * The patch and the archive for the first paint, read anonymously. A copy
 * the process already holds is used at once; a part never read before waits
 * at most the shared first-paint budget, else it is `null` and the browser
 * loads it. Patch notes are public, so nothing here depends on the viewer.
 */
export function loadPublicPatchNotes(version: string | null): Promise<PublicPatchNotes> {
  return readPatchNotes(version, Date.now() + FIRST_PAINT_READ_BUDGET_MS);
}
