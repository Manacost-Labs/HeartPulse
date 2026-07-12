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
import { Router, type Request, type RequestHandler, type Response } from 'express';

const MAX_POSITION_KEYS = 64;
const MAX_CLASS_ID_LENGTH = 80;
const MAX_POSITION_LENGTH = 120;
const SAFE_CLASS_ID = /^[\p{L}\p{N}_-]+$/u;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export type ClassPositionsDocument = {
  positions: Record<string, string>;
  updatedAt: string | null;
};

export type AdminClassPositionRouterDependencies = {
  adminGuard: RequestHandler;
  adminAuth: (request: Request) => unknown | null;
  loadPositions: () => unknown;
  savePositions: (document: ClassPositionsDocument) => void;
  setPrivateNoStore: (response: Response) => void;
  now?: () => Date;
};

export class ClassPositionsValidationError extends Error {}

export function normalizeClassPositions(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ClassPositionsValidationError('positions must be an object');
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_POSITION_KEYS) {
    throw new ClassPositionsValidationError(`positions cannot contain more than ${MAX_POSITION_KEYS} keys`);
  }

  const normalized: Record<string, string> = Object.create(null);
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key || key.length > MAX_CLASS_ID_LENGTH || !SAFE_CLASS_ID.test(key) || UNSAFE_OBJECT_KEYS.has(key)) {
      throw new ClassPositionsValidationError('positions contains an invalid class id');
    }
    if (Object.hasOwn(normalized, key)) {
      throw new ClassPositionsValidationError('positions contains duplicate class ids');
    }
    if (rawValue === null || rawValue === undefined || rawValue === '') continue;
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
      throw new ClassPositionsValidationError('position values must be strings or numbers');
    }
    const position = String(rawValue).trim();
    if (!position) continue;
    if (position.length > MAX_POSITION_LENGTH) {
      throw new ClassPositionsValidationError(`position values cannot exceed ${MAX_POSITION_LENGTH} characters`);
    }
    normalized[key] = position;
  }
  return normalized;
}

export function writeClassPositionsFile(dataDirectory: string, document: ClassPositionsDocument): string {
  mkdirSync(dataDirectory, { recursive: true });
  const destination = join(dataDirectory, 'class_positions.json');
  const temporary = join(dataDirectory, `.class_positions.${process.pid}.${randomUUID()}.tmp`);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, 'wx', 0o640);
    fchmodSync(descriptor, 0o640);
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

export function createAdminClassPositionRouter(
  dependencies: AdminClassPositionRouterDependencies,
): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());

  router.get('/admin-class-positions', dependencies.adminGuard, (request, response) => {
    dependencies.setPrivateNoStore(response);
    if (!dependencies.adminAuth(request)) return response.status(401).json({ error: 'Требуется вход' });
    try {
      return response.json(dependencies.loadPositions());
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить позиции классов' });
    }
  });

  router.post('/admin-class-positions', dependencies.adminGuard, (request, response) => {
    dependencies.setPrivateNoStore(response);
    if (!dependencies.adminAuth(request)) return response.status(401).json({ error: 'Требуется вход' });
    let positions: Record<string, string>;
    try {
      positions = normalizeClassPositions(request.body?.positions);
    } catch (error) {
      if (error instanceof ClassPositionsValidationError) {
        return response.status(400).json({ error: error.message });
      }
      return response.status(400).json({ error: 'positions must be an object' });
    }

    const document: ClassPositionsDocument = { positions, updatedAt: now().toISOString() };
    try {
      dependencies.savePositions(document);
      return response.json({ success: true, ...document });
    } catch {
      return response.status(500).json({ error: 'Не удалось сохранить позиции классов' });
    }
  });

  return router;
}
