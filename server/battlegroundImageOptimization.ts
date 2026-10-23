import sharp from 'sharp';

export type BattlegroundImageFormat = 'webp';

export type BattlegroundImageTransform = {
  width: number;
  quality: number;
  format: BattlegroundImageFormat;
  /** Cuts uniform white padding first: card art originals are padded to a square. */
  trim?: true;
};

const MIN_WIDTH = 96;
// The minion plate art is drawn up to 700 CSS px wide, 1024 px for dense screens (src/features/BattlegroundMinionHeader.tsx).
const MAX_WIDTH = 1024;
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
    ...(query.trim === '1' ? { trim: true as const } : {}),
  };
}

export function battlegroundImageTransformCacheKey(transform: BattlegroundImageTransform): string {
  return `${transform.format}:w${transform.width}:q${transform.quality}${transform.trim ? ':trim' : ''}`;
}

export async function optimizeBattlegroundImage(
  source: Buffer,
  transform: BattlegroundImageTransform,
): Promise<{ body: Buffer; contentType: string }> {
  let image = sharp(source, { limitInputPixels: 24_000_000 }).rotate();
  // Trim in its own pass, so the resize below works on the trimmed size.
  if (transform.trim) image = sharp(await image.trim({ background: '#ffffff', threshold: 40 }).toBuffer());
  const body = await image
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
