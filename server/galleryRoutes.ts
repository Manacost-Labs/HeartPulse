import { randomBytes } from 'node:crypto';
import { chmodSync, createReadStream, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import sharp from 'sharp';
import { detectAdminUploadFormat, type SupportedImageFormat } from './imageFormat.js';

type GalleryImageKind = 'original' | 'preview' | 'thumb';

export type GalleryItemRecord = {
  id: string;
  title: string;
  description: string;
  tag: string;
  source: string;
  width: number;
  height: number;
  bytes: number;
  format: SupportedImageFormat;
  originalFile: string;
  previewFile: string;
  thumbFile: string;
  createdAt: string;
  updatedAt: string;
};

type GalleryRecords = { items: GalleryItemRecord[]; updatedAt: string | null };
type CachedData = { data: any; etag: string };

export type GalleryRouterDependencies = {
  dataDir: string;
  uploadDir: string;
  uploadMaxBytes: number;
  uploadMaxPixels: number;
  previewMaxWidth: number;
  thumbMaxWidth: number;
  loadData: (filename: string) => any | null;
  loadDataCached: (filename: string) => CachedData | null;
  invalidateDataCache: (filename: string) => void;
  sendJsonCached: (request: Request, response: Response, data: any, etag: string, cacheHeader: string) => unknown;
  publicCacheHeader: string;
  adminGuard: RequestHandler;
  adminAuth: (request: Request) => unknown | null;
  setPrivateNoStore: (response: Response) => void;
  now?: () => Date;
  createId?: () => string;
};

const normalizeText = (value: unknown, maxLength: number) => String(value ?? '').trim().slice(0, maxLength);
const safeGalleryFileName = (value: string) => /^[a-z0-9_-]+\.(?:webp|png|jpe?g|gif)$/i.test(value);

export function normalizeGalleryItem(item: any, now = new Date()): GalleryItemRecord | null {
  const id = normalizeText(item?.id, 120);
  const originalFile = normalizeText(item?.originalFile, 180);
  const previewFile = normalizeText(item?.previewFile, 180);
  const thumbFile = normalizeText(item?.thumbFile, 180);
  const format = String(item?.format || '').toLowerCase() as SupportedImageFormat;
  if (!id || !originalFile || !previewFile || !thumbFile || !['gif', 'jpeg', 'png', 'webp'].includes(format)) return null;
  const timestamp = now.toISOString();
  return {
    id,
    title: normalizeText(item?.title, 160) || 'Арт Манакоста',
    description: normalizeText(item?.description, 900),
    tag: normalizeText(item?.tag, 80),
    source: normalizeText(item?.source, 180),
    width: Math.max(0, Number(item?.width || 0)),
    height: Math.max(0, Number(item?.height || 0)),
    bytes: Math.max(0, Number(item?.bytes || 0)),
    format,
    originalFile,
    previewFile,
    thumbFile,
    createdAt: normalizeText(item?.createdAt, 40) || timestamp,
    updatedAt: normalizeText(item?.updatedAt, 40) || normalizeText(item?.createdAt, 40) || timestamp,
  };
}

function galleryFileUrl(id: string, kind: GalleryImageKind) {
  return `/api/gallery/${encodeURIComponent(id)}/${kind}`;
}

function publicGalleryItem(item: GalleryItemRecord) {
  return {
    id: item.id, title: item.title, description: item.description, tag: item.tag, source: item.source,
    width: item.width, height: item.height, bytes: item.bytes, format: item.format,
    previewUrl: galleryFileUrl(item.id, 'preview'), thumbUrl: galleryFileUrl(item.id, 'thumb'), imageUrl: galleryFileUrl(item.id, 'original'),
    downloadUrl: `/api/gallery/${encodeURIComponent(item.id)}/download`, createdAt: item.createdAt, updatedAt: item.updatedAt,
  };
}

export function createGalleryRouter(dependencies: GalleryRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? (() => `gal_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`);
  const galleryJsonFile = join(dependencies.dataDir, 'gallery.json');
  mkdirSync(dependencies.uploadDir, { recursive: true });

  const recordsFromRaw = (raw: any): GalleryRecords => {
    const items = Array.isArray(raw?.items) ? raw.items.map((item: any) => normalizeGalleryItem(item, now())).filter(Boolean) as GalleryItemRecord[] : [];
    items.sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '') || b.id.localeCompare(a.id));
    return { items, updatedAt: normalizeText(raw?.updatedAt, 40) || (items[0]?.updatedAt ?? null) };
  };
  const loadRecords = () => recordsFromRaw(dependencies.loadData('gallery.json') ?? { items: [], updatedAt: null });
  const saveRecords = (records: GalleryRecords) => {
    mkdirSync(dependencies.dataDir, { recursive: true });
    writeFileSync(galleryJsonFile, JSON.stringify(records, null, 2), 'utf8');
    dependencies.invalidateDataCache('gallery.json');
  };
  const publicData = (records = loadRecords()) => ({ items: records.items.map(publicGalleryItem), updatedAt: records.updatedAt });
  const findItem = (id: string) => loadRecords().items.find(item => item.id === id) ?? null;
  const fileNameFor = (item: GalleryItemRecord, kind: GalleryImageKind) => kind === 'original' ? item.originalFile : kind === 'preview' ? item.previewFile : item.thumbFile;
  const contentTypeFor = (item: GalleryItemRecord, kind: GalleryImageKind) => kind === 'preview' || kind === 'thumb' ? 'image/webp' : item.format === 'jpeg' ? 'image/jpeg' : `image/${item.format}`;
  const sendImage = (request: Request, response: Response, item: GalleryItemRecord, kind: GalleryImageKind, download = false) => {
    const fileName = fileNameFor(item, kind);
    const filePath = join(dependencies.uploadDir, fileName);
    if (!safeGalleryFileName(fileName) || !existsSync(filePath)) return response.status(404).json({ error: 'Файл не найден' });
    const stat = statSync(filePath);
    const etag = `"gallery-${item.id}-${kind}-${stat.mtimeMs.toString(36)}-${stat.size}"`;
    response.set('Cache-Control', 'public, max-age=2592000, immutable');
    response.set('ETag', etag);
    response.type(contentTypeFor(item, kind));
    if (download) {
      const extension = item.format === 'jpeg' ? 'jpg' : item.format;
      const displayName = `${item.title || item.id}`.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || item.id;
      response.set('Content-Disposition', `attachment; filename="gallery-${item.id}.${extension}"; filename*=UTF-8''${encodeURIComponent(`${displayName}.${extension}`)}`);
    }
    if (request.headers['if-none-match'] === etag) return response.status(304).end();
    return createReadStream(filePath).pipe(response);
  };
  const removeFiles = (item: GalleryItemRecord) => {
    for (const fileName of [item.originalFile, item.previewFile, item.thumbFile]) {
      if (!safeGalleryFileName(fileName)) continue;
      try { const filePath = join(dependencies.uploadDir, fileName); if (existsSync(filePath)) unlinkSync(filePath); }
      catch (error) { console.warn('[gallery] failed to remove file', fileName, error); }
    }
  };

  router.get('/gallery', (request, response) => {
    const entry = dependencies.loadDataCached('gallery.json');
    const records = entry ? recordsFromRaw(entry.data) : { items: [], updatedAt: null };
    const etag = entry ? `"${entry.etag.replace(/^"|"$/g, '')}-public"` : '"gallery-empty"';
    return dependencies.sendJsonCached(request, response, publicData(records), etag, dependencies.publicCacheHeader);
  });
  router.get('/gallery/:id/:kind(original|preview|thumb)', (request, response) => {
    const id = normalizeText(request.params.id, 120);
    const item = id ? findItem(id) : null;
    return item ? sendImage(request, response, item, String(request.params.kind) as GalleryImageKind) : response.status(404).json({ error: 'Арт не найден' });
  });
  router.get('/gallery/:id/download', (request, response) => {
    const id = normalizeText(request.params.id, 120);
    const item = id ? findItem(id) : null;
    return item ? sendImage(request, response, item, 'original', true) : response.status(404).json({ error: 'Арт не найден' });
  });
  router.get('/admin/gallery', dependencies.adminGuard, (request, response) => {
    if (!dependencies.adminAuth(request)) return response.status(401).json({ error: 'Требуется вход' });
    dependencies.setPrivateNoStore(response);
    return response.json(publicData());
  });
  router.post('/admin/gallery', dependencies.adminGuard, async (request, response) => {
    if (!dependencies.adminAuth(request)) return response.status(401).json({ error: 'Требуется вход' });
    const title = normalizeText(request.body?.title, 160);
    const match = String(request.body?.dataUrl || '').match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i);
    if (!title) return response.status(400).json({ error: 'Название обязательно' });
    if (!match) return response.status(400).json({ error: 'Нужно передать изображение в формате data URL' });
    try {
      const base64 = match[1].replace(/\s/g, '');
      if (!/^[a-z0-9+/]+={0,2}$/i.test(base64) || base64.length % 4 !== 0) return response.status(400).json({ error: 'Некорректные base64-данные изображения' });
      const source = Buffer.from(base64, 'base64');
      if (!source.length) return response.status(400).json({ error: 'Файл пустой' });
      if (source.length > dependencies.uploadMaxBytes) return response.status(413).json({ error: `Файл больше ${Math.round(dependencies.uploadMaxBytes / 1024 / 1024)} МБ` });
      const format = detectAdminUploadFormat(source);
      if (!format) return response.status(415).json({ error: 'Формат изображения не распознан' });
      const metadata = await sharp(source, { limitInputPixels: dependencies.uploadMaxPixels }).metadata();
      const width = Number(metadata.width || 0); const height = Number(metadata.height || 0);
      if (!width || !height) return response.status(400).json({ error: 'Не удалось определить размер изображения' });
      if ((metadata.pages || 1) > 1) return response.status(400).json({ error: 'Анимированные изображения пока не поддерживаются' });
      if (width * height > dependencies.uploadMaxPixels) return response.status(413).json({ error: 'Разрешение изображения слишком большое для обработки' });
      mkdirSync(dependencies.uploadDir, { recursive: true });
      const id = createId(); const originalExtension = format === 'jpeg' ? 'jpg' : format;
      const originalFile = `${id}.${originalExtension}`; const previewFile = `${id}-preview.webp`; const thumbFile = `${id}-thumb.webp`;
      writeFileSync(join(dependencies.uploadDir, originalFile), source); chmodSync(join(dependencies.uploadDir, originalFile), 0o644);
      const pipeline = sharp(source, { limitInputPixels: dependencies.uploadMaxPixels }).rotate();
      const preview = await pipeline.clone().resize({ width: dependencies.previewMaxWidth, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
      const thumb = await pipeline.clone().resize({ width: dependencies.thumbMaxWidth, height: Math.round(dependencies.thumbMaxWidth * 0.72), fit: 'cover', position: 'attention', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      writeFileSync(join(dependencies.uploadDir, previewFile), preview); writeFileSync(join(dependencies.uploadDir, thumbFile), thumb);
      chmodSync(join(dependencies.uploadDir, previewFile), 0o644); chmodSync(join(dependencies.uploadDir, thumbFile), 0o644);
      const timestamp = now().toISOString(); const records = loadRecords();
      const item: GalleryItemRecord = { id, title, description: normalizeText(request.body?.description, 900), tag: normalizeText(request.body?.tag, 80), source: normalizeText(request.body?.source, 180), width, height, bytes: source.length, format, originalFile, previewFile, thumbFile, createdAt: timestamp, updatedAt: timestamp };
      records.items.unshift(item); records.updatedAt = timestamp; saveRecords(records);
      return response.json({ success: true, item: publicGalleryItem(item) });
    } catch (error: any) {
      console.warn('[gallery] upload failed:', error?.message || error);
      return response.status(500).json({ error: 'Не удалось обработать арт' });
    }
  });
  router.delete('/admin/gallery/:id', dependencies.adminGuard, (request, response) => {
    if (!dependencies.adminAuth(request)) return response.status(401).json({ error: 'Требуется вход' });
    const id = normalizeText(request.params.id, 120);
    if (!id) return response.status(400).json({ error: 'id обязателен' });
    const records = loadRecords(); const item = records.items.find(entry => entry.id === id);
    if (!item) return response.status(404).json({ error: 'Арт не найден' });
    removeFiles(item); records.items = records.items.filter(entry => entry.id !== id); records.updatedAt = now().toISOString(); saveRecords(records);
    return response.json({ success: true });
  });
  return router;
}
