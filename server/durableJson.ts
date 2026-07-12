import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fchmodSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const SAFE_JSON_FILENAME = /^[a-z0-9][a-z0-9._-]*\.json$/i;

export function writeJsonAtomically(
  dataDirectory: string,
  filename: string,
  document: unknown,
  mode = 0o640,
): string {
  if (!SAFE_JSON_FILENAME.test(filename)) throw new Error('unsafe JSON filename');
  mkdirSync(dataDirectory, { recursive: true });
  const destination = join(dataDirectory, filename);
  const temporary = join(dataDirectory, `.${filename}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, 'wx', mode);
    fchmodSync(descriptor, mode);
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporary, destination);
    const directoryDescriptor = openSync(dataDirectory, 'r');
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
    return destination;
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    try { unlinkSync(temporary); } catch { /* temporary file was not created or was already renamed */ }
    throw error;
  }
}
