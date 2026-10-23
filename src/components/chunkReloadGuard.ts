/** How long a reload made for a chunk that failed to load blocks the next one. */
export const CHUNK_RELOAD_COOLDOWN_MS = 30_000;
const KEY = 'hp:chunk-reload-at';

type ReloadStore = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Whether a page whose code failed to load may reload itself now, and if so
 * remembers the attempt. A network blip or a tab that outlived a deploy heals
 * with one reload; a second failure within the cooldown shows the error page
 * instead of looping. Without storage nothing is remembered, so no reload.
 */
export function claimChunkReload(store: ReloadStore | null, now: number): boolean {
  if (!store) return false;
  try {
    const last = Number(store.getItem(KEY));
    if (Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_COOLDOWN_MS) return false;
    store.setItem(KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
