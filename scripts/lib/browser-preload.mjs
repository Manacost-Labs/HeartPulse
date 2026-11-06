import { open, realpath } from 'node:fs/promises';
import path from 'node:path';

/** Sequentially populate the page cache; failure never replaces the real launch. */
export async function preloadBrowserExecutable(executablePath, { signal = AbortSignal.timeout(10_000) } = {}) {
  const started = performance.now();
  let file;
  let bytes = 0;
  let outcome = 'skipped';
  let code;
  try {
    const resolved = await realpath(executablePath);
    // Google's Linux launcher script execs its sibling ELF named "chrome".
    const target = path.basename(resolved) === 'google-chrome' ? path.join(path.dirname(resolved), 'chrome') : resolved;
    file = await open(target, 'r');
    const stat = await file.stat();
    if (stat.isFile() && stat.size >= 4 && stat.size <= 512 * 1024 * 1024) {
      const magic = Buffer.alloc(4);
      await file.read(magic, 0, magic.length, 0);
      if (magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        while (bytes < stat.size) {
          signal.throwIfAborted();
          const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, stat.size - bytes), bytes);
          if (!bytesRead) break;
          bytes += bytesRead;
        }
        signal.throwIfAborted();
        outcome = bytes === stat.size ? 'ready' : 'unavailable';
      }
    }
  } catch (error) {
    outcome = 'unavailable';
    code = error.code ?? 'READ_ERROR';
  } finally {
    await file?.close().catch(() => {});
  }
  return { outcome, bytes, milliseconds: Math.round(performance.now() - started), ...(code ? { code } : {}) };
}
