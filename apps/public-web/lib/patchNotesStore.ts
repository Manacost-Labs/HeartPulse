import { fetchPublicExpress } from './expressApi';
import { createPatchNotesReader } from './publicPatchNotesData';

const READER_KEY = Symbol.for('hearthpulse.patchNotesReader');

/**
 * One patch-notes cache per Node process (it starts empty after a restart).
 * `proxy.ts` warms it before the page renders, and the two are bundled apart,
 * so it hangs off `globalThis`.
 */
export function patchNotesReader() {
  const holder = globalThis as unknown as { [READER_KEY]?: ReturnType<typeof createPatchNotesReader> };
  return holder[READER_KEY] ??= createPatchNotesReader({ request: (path, signal) => fetchPublicExpress(path, signal) });
}
