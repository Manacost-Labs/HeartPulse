const key = 'hp_reader_interaction';
const uidPattern = /^[A-Za-z0-9_-]{20,128}$/;
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Only a short-lived interaction handle survives social-login navigation; it is not an authentication credential. */
export function readerAuthContinuation(search: string, storageSource: StoragePort | (() => StoragePort), authenticated: boolean, now = Date.now()): string | null {
  try {
    const storage = typeof storageSource === 'function' ? storageSource() : storageSource;
    const params = new URLSearchParams(search);
    const uid = params.get('reader_interaction');
    if (params.has('login') && uid && uidPattern.test(uid) && params.getAll('reader_interaction').length === 1) {
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
