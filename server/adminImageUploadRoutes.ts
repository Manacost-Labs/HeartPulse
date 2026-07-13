import { randomBytes } from 'node:crypto';
import { chmod, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router, type Request, type Response } from 'express';
import sharp from 'sharp';
import { detectAdminUploadFormat } from './imageFormat.js';

export type AdminImageUploadDependencies = {
  adminAuth: (request: Request) => unknown | null;
  contestAdminAuth: (request: Request) => unknown | null;
  setPrivateNoStore: (response: Response) => void;
  publicDir: string;
  sourceDir: string;
  maxBytes: number;
  maxPixels: number;
  maxWidth: number;
  maxHeight: number;
  createFileName?: () => string;
  transform?: (source: Buffer) => Promise<{ output: Buffer; width: number; height: number; pages: number }>;
};

export function decodeAdminImageDataUrl(value: unknown): Buffer | null {
  const match = String(value || '').match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const base64 = match[1].replace(/\s/g, '');
  if (!/^[a-z0-9+/]+={0,2}$/i.test(base64) || base64.length % 4 !== 0) return null;
  return Buffer.from(base64, 'base64');
}

export async function writeAdminImageAtomically(
  publicDir: string,
  sourceDir: string,
  fileName: string,
  output: Buffer,
  operations = { chmod, mkdir, rename, unlink, writeFile },
) {
  if (!/^[a-z0-9-]+\.webp$/i.test(fileName)) throw new Error('Unsafe generated upload filename');
  await operations.mkdir(publicDir, { recursive: true });
  await operations.mkdir(sourceDir, { recursive: true });
  const targets = [...new Set([join(publicDir, fileName), join(sourceDir, fileName)])];
  const nonce = randomBytes(4).toString('hex');
  const temporary = targets.map(target => `${target}.${nonce}.tmp`);
  const published: string[] = [];
  try {
    for (const path of temporary) {
      await operations.writeFile(path, output, { flag: 'wx', mode: 0o600 });
      await operations.chmod(path, 0o644);
    }
    for (let index = 0; index < targets.length; index += 1) {
      await operations.rename(temporary[index], targets[index]);
      published.push(targets[index]);
    }
  } catch (error) {
    await Promise.allSettled([...temporary, ...published].map(async path => {
      try { await operations.unlink(path); } catch (cleanupError: any) { if (cleanupError?.code !== 'ENOENT') throw cleanupError; }
    }));
    throw error;
  }
}

export function createAdminImageUploadRouter(dependencies: AdminImageUploadDependencies): Router {
  const router = Router();
  const createFileName = dependencies.createFileName
    ?? (() => `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}.webp`);
  const transform = dependencies.transform ?? (async source => {
    const metadata = await sharp(source, { limitInputPixels: dependencies.maxPixels }).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    const output = await sharp(source, { limitInputPixels: dependencies.maxPixels })
      .rotate()
      .resize({ width: 1800, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    return { output, width, height, pages: Number(metadata.pages || 1) };
  });

  router.post('/admin/uploads/image', async (request, response) => {
    dependencies.setPrivateNoStore(response);
    if (!dependencies.adminAuth(request) && !dependencies.contestAdminAuth(request)) {
      return response.status(403).json({ error: 'Недостаточно прав' });
    }
    const source = decodeAdminImageDataUrl(request.body?.dataUrl);
    if (!source) return response.status(400).json({ error: 'Нужно передать корректное изображение в формате data URL' });
    if (!source.length) return response.status(400).json({ error: 'Файл пустой' });
    if (source.length > dependencies.maxBytes) {
      return response.status(413).json({ error: `Картинка больше ${Math.round(dependencies.maxBytes / 1024 / 1024)} МБ` });
    }
    if (!detectAdminUploadFormat(source)) return response.status(415).json({ error: 'Формат изображения не распознан' });

    try {
      const { output, width, height, pages } = await transform(source);
      if (!width || !height) return response.status(400).json({ error: 'Не удалось определить размер изображения' });
      if (pages > 1) return response.status(400).json({ error: 'Анимированные изображения не поддерживаются' });
      if (width > dependencies.maxWidth || height > dependencies.maxHeight || width * height > dependencies.maxPixels) {
        return response.status(413).json({ error: 'Разрешение изображения слишком большое' });
      }
      const fileName = createFileName();
      await writeAdminImageAtomically(dependencies.publicDir, dependencies.sourceDir, fileName, output);
      return response.json({ success: true, url: `/uploads/admin/${fileName}` });
    } catch (error: any) {
      console.warn('[admin-upload] image processing failed:', error?.message || error);
      return response.status(500).json({ error: 'Не удалось обработать изображение' });
    }
  });

  return router;
}
