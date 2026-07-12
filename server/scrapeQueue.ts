import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type express from 'express';

export function queueScrapeRequest(dataDirectory: string, now = new Date()): string {
  mkdirSync(dataDirectory, { recursive: true });
  const destination = join(dataDirectory, '.scrape-request');
  const temporary = join(dataDirectory, `.scrape-request.${process.pid}.${randomUUID()}.tmp`);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, 'wx', 0o640);
    writeFileSync(descriptor, `${now.toISOString()}\n`, 'utf8');
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
    try { unlinkSync(temporary); } catch { /* file was never created or already renamed */ }
    throw error;
  }
}

export function createScrapeQueueHandler(dataDirectory: string): express.RequestHandler {
  return (_req, res) => {
    try {
      queueScrapeRequest(dataDirectory);
      return res.status(202).json({ message: 'Парсинг поставлен в изолированную очередь' });
    } catch {
      return res.status(503).json({ error: 'Не удалось поставить парсинг в очередь' });
    }
  };
}
