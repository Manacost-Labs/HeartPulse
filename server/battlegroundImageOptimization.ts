import sharp from 'sharp';

export type BattlegroundImageFormat = 'webp';

export type BattlegroundImageTransform = {
  width: number;
  quality: number;
  format: BattlegroundImageFormat;
};

const MIN_WIDTH = 96;
const MAX_WIDTH = 512;
const DEFAULT_QUALITY = 76;
const MIN_QUALITY = 55;
const MAX_QUALITY = 88;

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function battlegroundImageTransformFromQuery(
  query: Record<string, unknown>,
): BattlegroundImageTransform | null {
  const requestedWidth = Number.parseInt(String(query.width ?? ''), 10);
  if (!Number.isFinite(requestedWidth) || requestedWidth < 1) return null;

  return {
    width: boundedInteger(requestedWidth, MIN_WIDTH, MAX_WIDTH, 220),
    quality: boundedInteger(query.quality, MIN_QUALITY, MAX_QUALITY, DEFAULT_QUALITY),
    format: 'webp',
  };
}

export function battlegroundImageTransformCacheKey(transform: BattlegroundImageTransform): string {
  return `${transform.format}:w${transform.width}:q${transform.quality}`;
}

export async function optimizeBattlegroundImage(
  source: Buffer,
  transform: BattlegroundImageTransform,
): Promise<{ body: Buffer; contentType: string }> {
  const body = await sharp(source, { limitInputPixels: 24_000_000 })
    .rotate()
    .resize({
      width: transform.width,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({
      quality: transform.quality,
      effort: 3,
      smartSubsample: true,
    })
    .toBuffer();

  return {
    body,
    contentType: 'image/webp',
  };
}
