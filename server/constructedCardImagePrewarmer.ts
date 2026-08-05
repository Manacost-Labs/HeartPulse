import { randomBytes } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  CARD_IMAGE_CACHE_VERSION,
  CARD_IMAGE_VARIANTS,
  cardImageCacheFilename,
  type CardImageVariant,
} from './cardImageCache.js';
import {
  createBlizzardCardImageClient,
  downloadBlizzardImageUrl,
} from './blizzardCards.js';
import { resolveConstructedCardImageSourceUrl } from './constructedCardImageOverrides.js';

const MANIFEST_FILE = 'blizzard-thumbnails-manifest-v1.json';
const CHECKPOINT_SIZE = 100;
const PREWARM_VARIANTS: CardImageVariant[] = ['thumb', 'full'];

type ManifestCard = {
  sourceUrl: string;
  cacheFile?: string;
  cacheFiles?: Record<CardImageVariant, string>;
  updatedAt: string;
};

type ThumbnailManifest = {
  schemaVersion: 1;
  generatedAt: string;
  cacheVersion: string;
  cards: Record<string, ManifestCard>;
};

type SyncOptions = {
  dbfIds: number[];
  cacheDir: string;
  getImageUrl: (dbfId: number) => Promise<string | null>;
  downloadImage?: (url: string) => Promise<Buffer>;
  concurrency?: number;
  now?: () => Date;
};

export type ConstructedCardThumbnailSyncResult = {
  total: number;
  updated: number;
  skipped: number;
  missing: number;
  failed: number;
  bytesWritten: number;
  errors: Array<{ dbfId: number; message: string }>;
};

function positiveDbfId(value: unknown): number | null {
  const dbfId = Number(value);
  return Number.isInteger(dbfId) && dbfId > 0 ? dbfId : null;
}

export function collectConstructedCardDbfIds(catalogs: unknown[]): number[] {
  const ids = new Set<number>();
  for (const catalogValue of catalogs) {
    const records = Array.isArray(catalogValue)
      ? catalogValue
      : Array.isArray((catalogValue as any)?.cards)
        ? (catalogValue as any).cards
        : [];
    for (const record of records) {
      const dbfId = positiveDbfId(record?.dbf ?? record?.dbfId);
      if (dbfId) ids.add(dbfId);
    }
  }
  return [...ids].sort((left, right) => left - right);
}

function emptyManifest(now: Date): ThumbnailManifest {
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    cacheVersion: CARD_IMAGE_CACHE_VERSION,
    cards: {},
  };
}

async function readManifest(path: string, now: Date): Promise<ThumbnailManifest> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    if (
      parsed?.schemaVersion === 1
      && parsed?.cacheVersion === CARD_IMAGE_CACHE_VERSION
      && parsed?.cards
      && typeof parsed.cards === 'object'
      && !Array.isArray(parsed.cards)
    ) {
      return parsed as ThumbnailManifest;
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn('[card-image-sync] ignoring invalid manifest:', error?.message ?? error);
    }
  }
  return emptyManifest(now);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(path: string, data: Buffer | string): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, data, { mode: 0o640 });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function persistManifest(path: string, manifest: ThumbnailManifest, now: Date): Promise<void> {
  manifest.generatedAt = now.toISOString();
  await atomicWrite(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function mapWithConcurrency<T>(
  values: number[],
  concurrency: number,
  task: (value: number) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(values[index]);
    }
  }));
  return results;
}

export async function syncConstructedCardThumbnails(
  options: SyncOptions,
): Promise<ConstructedCardThumbnailSyncResult> {
  const now = options.now ?? (() => new Date());
  const concurrency = Math.max(1, Math.min(8, Math.trunc(options.concurrency ?? 4)));
  const downloadImage = options.downloadImage ?? downloadBlizzardImageUrl;
  const dbfIds = collectConstructedCardDbfIds([options.dbfIds.map(dbf => ({ dbf }))]);
  const cacheDir = resolve(options.cacheDir);
  const manifestPath = join(cacheDir, MANIFEST_FILE);
  await mkdir(cacheDir, { recursive: true, mode: 0o750 });
  const manifest = await readManifest(manifestPath, now());
  const result: ConstructedCardThumbnailSyncResult = {
    total: dbfIds.length,
    updated: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
    bytesWritten: 0,
    errors: [],
  };

  for (let offset = 0; offset < dbfIds.length; offset += CHECKPOINT_SIZE) {
    const batch = dbfIds.slice(offset, offset + CHECKPOINT_SIZE);
    let batchChanged = false;
    await mapWithConcurrency(batch, concurrency, async dbfId => {
      try {
        const sourceUrl = await options.getImageUrl(dbfId);
        if (!sourceUrl) {
          result.missing += 1;
          return;
        }
        const cacheFiles = Object.fromEntries(PREWARM_VARIANTS.map(variant => [
          variant,
          cardImageCacheFilename(dbfId, variant, 'blizzard'),
        ])) as Record<CardImageVariant, string>;
        const previous = manifest.cards[String(dbfId)];
        const sourceUnchanged = previous?.sourceUrl === sourceUrl;
        const variantsToWrite: CardImageVariant[] = [];
        for (const variant of PREWARM_VARIANTS) {
          if (!sourceUnchanged || !(await pathExists(join(cacheDir, cacheFiles[variant])))) {
            variantsToWrite.push(variant);
          }
        }
        if (variantsToWrite.length === 0) {
          if (
            previous?.cacheFiles?.thumb !== cacheFiles.thumb
            || previous?.cacheFiles?.full !== cacheFiles.full
          ) {
            manifest.cards[String(dbfId)] = {
              ...previous,
              sourceUrl,
              cacheFile: cacheFiles.thumb,
              cacheFiles,
              updatedAt: previous?.updatedAt ?? now().toISOString(),
            };
            batchChanged = true;
          }
          result.skipped += 1;
          return;
        }

        const original = await downloadImage(sourceUrl);
        for (const variant of variantsToWrite) {
          const settings = CARD_IMAGE_VARIANTS[variant];
          const rendered = await sharp(original)
            .resize({ width: settings.width, withoutEnlargement: true })
            .webp({ quality: settings.quality, effort: 4 })
            .toBuffer();
          await atomicWrite(join(cacheDir, cacheFiles[variant]), rendered);
          result.bytesWritten += rendered.length;
        }
        manifest.cards[String(dbfId)] = {
          sourceUrl,
          cacheFile: cacheFiles.thumb,
          cacheFiles,
          updatedAt: now().toISOString(),
        };
        batchChanged = true;
        result.updated += 1;
      } catch (error: any) {
        result.failed += 1;
        if (result.errors.length < 50) {
          result.errors.push({
            dbfId,
            message: String(error?.message ?? error).slice(0, 300),
          });
        }
      }
    });
    if (batchChanged) await persistManifest(manifestPath, manifest, now());
  }

  if (!(await pathExists(manifestPath))) {
    await persistManifest(manifestPath, manifest, now());
  }
  return result;
}

async function loadCatalog(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function runConstructedCardImagePrewarmer(): Promise<ConstructedCardThumbnailSyncResult> {
  const modulePath = fileURLToPath(import.meta.url);
  const appRoot = resolve(process.env.APP_ROOT_DIR || join(dirname(modulePath), '..', '..'));
  const dataDir = resolve(process.env.SERVER_DATA_DIR || join(appRoot, 'server', 'data'));
  const catalogDir = join(dataDir, 'constructed-card-catalog-v1');
  const catalogs = await Promise.all([
    loadCatalog(join(catalogDir, 'standard.json')),
    loadCatalog(join(catalogDir, 'wild.json')),
  ]);
  const dbfIds = collectConstructedCardDbfIds(catalogs);
  if (dbfIds.length === 0) throw new Error('Constructed card catalogs contain no DBF IDs');

  const client = createBlizzardCardImageClient({
    clientId: process.env.BLIZZARD_CLIENT_ID,
    clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
    region: process.env.BLIZZARD_REGION,
  });
  if (!client.configured) throw new Error('Blizzard credentials are not configured');

  return syncConstructedCardThumbnails({
    dbfIds,
    cacheDir: join(dataDir, 'card-images'),
    getImageUrl: async dbfId => resolveConstructedCardImageSourceUrl(
      dbfId,
      await client.getImageUrl(dbfId),
    ),
    concurrency: Number(process.env.CARD_IMAGE_SYNC_CONCURRENCY || 4),
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const startedAt = Date.now();
  runConstructedCardImagePrewarmer()
    .then(result => {
      console.log(JSON.stringify({
        event: 'constructed_card_image_sync_completed',
        durationMs: Date.now() - startedAt,
        ...result,
      }));
    })
    .catch(error => {
      console.error('[card-image-sync] failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
