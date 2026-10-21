import { TIER_BUILDER_TIERS, tierBuilderCardImage, type TierBuilderCard, type TierBuilderPlacement } from '../modules/battlegrounds/public';

/** Image loading of the classic runtime (`window.Shared.loadImageFromSource`): it refetches cross-origin art as a blob. */
export type LoadExportImage = (src: string) => Promise<HTMLImageElement>;

export const TIER_BUILDER_BACKGROUNDS = [
  { value: 'transparent', label: 'Без фона', url: null },
  { value: 'wallpaper', label: 'Фон 1', url: '/bg-legacy/wallpaper.webp' },
  { value: 'wallpaper1', label: 'Фон 2', url: '/bg-legacy/wallpaper1.webp' },
  { value: 'wallpaper2', label: 'Фон 3', url: '/bg-legacy/wallpaper2.webp' },
  { value: 'wallpaper3', label: 'Фон 4', url: '/bg-legacy/wallpaper3.webp' },
] as const;

export type TierBuilderBackground = (typeof TIER_BUILDER_BACKGROUNDS)[number]['value'];

const EXPORT_WIDTH = 2400;
const SIDE_PADDING = 48;
const OUTER_PADDING = 36;
const COLUMN_GAP = 20;
const INNER_ROW_GAP = 16;
const TIER_GAP = 36;
const LABEL_HEIGHT = 80;

async function drawWallpaper(ctx: CanvasRenderingContext2D, width: number, height: number, url: string, load: LoadExportImage) {
  try {
    const wallpaper = await load(url);
    const blur = 14;
    const bleed = blur * 4;
    const targetW = width + bleed * 2;
    const targetH = height + bleed * 2;
    const ratio = wallpaper.width / wallpaper.height;
    const drawW = ratio > targetW / targetH ? targetH * ratio : targetW;
    const drawH = ratio > targetW / targetH ? targetH : targetW / ratio;
    ctx.save();
    ctx.filter = `blur(${blur}px) brightness(0.45)`;
    ctx.drawImage(wallpaper, -bleed + (targetW - drawW) / 2, -bleed + (targetH - drawH) / 2, drawW, drawH);
    ctx.restore();
    ctx.fillStyle = 'rgba(4, 8, 16, 0.35)';
    ctx.fillRect(0, 0, width, height);
  } catch (error) {
    console.warn('Не удалось отрисовать игровой фон:', error);
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

/**
 * The classic "Скачать всё" image: every non-empty tier as a labelled band of
 * 512px card art, up to six per row, on a transparent or blurred wallpaper.
 * Throws when a card picture cannot load, so a partial image is never saved.
 */
export async function exportTierBuilderImage({ placement, cards, fileType, background, load }: {
  placement: TierBuilderPlacement;
  cards: Map<string, TierBuilderCard>;
  fileType: 'png' | 'webp';
  background: TierBuilderBackground;
  load: LoadExportImage;
}): Promise<void> {
  const sections = [];
  for (const tier of TIER_BUILDER_TIERS) {
    const tierCards = (placement[tier.id] ?? []).map(id => cards.get(id)).filter((card): card is TierBuilderCard => !!card);
    if (!tierCards.length) continue;
    const images = await Promise.all(tierCards.map(card => load(tierBuilderCardImage(card, '512x'))));
    sections.push({ tier, images });
  }
  if (!sections.length) return;

  const columns = Math.min(6, Math.max(...sections.map(section => Math.min(section.images.length, 6))));
  const cardWidth = (EXPORT_WIDTH - SIDE_PADDING * 2 - COLUMN_GAP * (columns - 1)) / columns;
  const layouts = sections.map(({ tier, images }) => {
    const rows = Array.from({ length: Math.ceil(images.length / columns) }, (_, row) => images.slice(row * columns, (row + 1) * columns));
    const heights = rows.map(row => Math.max(...row.map(image => cardWidth * (image.height / image.width))));
    const content = heights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows.length - 1) * INNER_ROW_GAP;
    return { tier, rows, heights, content };
  });
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = Math.ceil(OUTER_PADDING * 2 + layouts.reduce((sum, layout) => sum + LABEL_HEIGHT + layout.content, 0)
    + Math.max(0, layouts.length - 1) * TIER_GAP);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const wallpaper = TIER_BUILDER_BACKGROUNDS.find(option => option.value === background)?.url;
  if (wallpaper) await drawWallpaper(ctx, canvas.width, canvas.height, wallpaper, load);

  let y = OUTER_PADDING;
  layouts.forEach((layout, index) => {
    ctx.save();
    ctx.fillStyle = 'rgba(240, 215, 154, 0.95)';
    ctx.font = '700 56px "BgDisplay", Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${layout.tier.label} · ${layout.tier.description}`, SIDE_PADDING, y + LABEL_HEIGHT / 2);
    ctx.restore();
    y += LABEL_HEIGHT;
    layout.rows.forEach((row, rowIndex) => {
      row.forEach((image, column) => {
        const height = cardWidth / (image.width / image.height);
        ctx.drawImage(image, SIDE_PADDING + column * (cardWidth + COLUMN_GAP), y + (layout.heights[rowIndex] - height) / 2, cardWidth, height);
      });
      y += layout.heights[rowIndex] + (rowIndex < layout.rows.length - 1 ? INNER_ROW_GAP : 0);
    });
    if (index < layouts.length - 1) y += TIER_GAP;
  });

  const mime = fileType === 'webp' ? 'image/webp' : 'image/png';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Не удалось собрать тир-лист.')), mime, fileType === 'webp' ? 0.98 : 1);
  });
  download(blob, `tier-list.${fileType}`);
}
