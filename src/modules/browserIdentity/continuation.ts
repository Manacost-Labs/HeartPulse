const key = 'hp_reader_interaction';
const uidPattern = /^[A-Za-z0-9_-]{20,128}$/;
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The live interaction handle, if any. Unlike `readerAuthContinuation` it never writes, extends or clears storage. */
export function pendingReaderInteraction(storageSource: StoragePort | (() => StoragePort), now = Date.now()): string | null {
  try {
    const storage = typeof storageSource === 'function' ? storageSource() : storageSource;
    const remembered = JSON.parse(storage.getItem(key) ?? 'null');
    if (!remembered || !uidPattern.test(remembered.uid) || !Number.isFinite(remembered.expiresAt) || remembered.expiresAt <= now) return null;
    return remembered.uid;
  } catch { return null; }
}

/**
 * The handle this visit brings, known before the fragment is captured: the one in `/?login#reader_interaction=…`
 * (only where `readerAuthContinuation` would store it) or the one already remembered. Writes nothing.
 */
export function incomingReaderInteraction(search: string, hash: string, storageSource: StoragePort | (() => StoragePort), now = Date.now()): string | null {
  const params = new URLSearchParams(search);
  const fragment = /^#reader_interaction=([A-Za-z0-9_-]{20,128})$/.exec(hash);
  if (fragment && params.has('login') && !params.has('reader_interaction')) return fragment[1];
  return pendingReaderInteraction(storageSource, now);
}

/** Only a short-lived interaction handle survives social-login navigation; it is not an authentication credential. */
export function readerAuthContinuation(search: string, storageSource: StoragePort | (() => StoragePort), authenticated: boolean, now = Date.now(), hash = ''): string | null {
  try {
    const storage = typeof storageSource === 'function' ? storageSource() : storageSource;
    const params = new URLSearchParams(search);
    const fragment = /^#reader_interaction=([A-Za-z0-9_-]{20,128})$/.exec(hash);
    const uid = fragment?.[1];
    if (params.has('login') && !params.has('reader_interaction') && uid) {
      storage.setItem(key, JSON.stringify({ uid, expiresAt: now + 600_000 }));
    }
    const remembered = JSON.parse(storage.getItem(key) ?? 'null');
    if (!remembered || !uidPattern.test(remembered.uid) || !Number.isFinite(remembered.expiresAt) || remembered.expiresAt <= now) {
      storage.removeItem(key); return null;
    }
    if (!authenticated) return null;
    storage.removeItem(key);
    return `/identity/interaction/${remembered.uid}`;
  } catch { return null; }
}
