import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/*
 * Derives the patch notes page art from images the site already ships, so the
 * page adds no new source artwork: mode plates (2.4:1, the archetype header
 * ratio) at 640 and 1280 px, and small mode and tavern-tier icons.
 * Run `node scripts/build-patch-notes-assets.mjs` and commit public/patch-notes.
 */

const PUBLIC = path.resolve('public');
const OUTPUT = path.join(PUBLIC, 'patch-notes');
const PLATE_WIDTHS = [640, 1280];
const PLATE_RATIO = 2.4;

/** `focus` is the crop centre of each source, chosen so the subject survives the left-hand gradient. */
const PLATES = {
  standard: { source: 'wallpaper/profile-hero-hth.webp', focus: 'attention' },
  wild: { source: 'bg-legacy/wallpaper.webp', focus: 'centre' },
  constructed: { source: 'wallpaper/wallpaper.webp', focus: 'centre' },
  battlegrounds: { source: 'bg-legacy/wallpaper1.webp', focus: 'centre' },
  other: { source: 'bg-legacy/wallpaper3.webp', focus: 'centre' },
};

const ICONS = {
  'mode-standard': 'card-format-standard.webp',
  'mode-wild': 'card-format-wild.webp',
  'mode-arena': 'assets/arena_icon.webp',
  'mode-battlegrounds': 'bg-legacy/assset/tier1.png',
};

async function plate(name, source, focus) {
  for (const width of PLATE_WIDTHS) {
    await sharp(path.join(PUBLIC, source))
      .resize(width, Math.round(width / PLATE_RATIO), { fit: 'cover', position: focus })
      .webp({ quality: 72, effort: 6 })
      .toFile(path.join(OUTPUT, `${name}-${width}.webp`));
  }
}

/** Arena: the home page's Uther (transparent PNG cut-out) on the site's red table cloth. */
async function arenaPlate() {
  const cloth = path.join(PUBLIC, 'wallpaper/arena-rail-red.jpg');
  const hero = path.join(PUBLIC, 'wallpaper/home-paladin-hero.webp');
  for (const width of PLATE_WIDTHS) {
    const height = Math.round(width / PLATE_RATIO);
    const tile = await sharp(cloth).resize({ height: Math.round(height / 2) }).toBuffer();
    // Uther is scaled past the plate height and cut at the knees, like the home page mural.
    const scaled = await sharp(hero).resize({ height: Math.round(height * 1.35) }).toBuffer({ resolveWithObject: true });
    const figure = await sharp(scaled.data)
      .extract({ left: 0, top: Math.round(height * 0.05), width: scaled.info.width, height }).toBuffer();
    await sharp({ create: { width, height, channels: 3, background: '#5d0d13' } })
      .composite([{ input: tile, tile: true, left: 0, top: 0 }, { input: figure, left: Math.round(width * 0.74 - scaled.info.width / 2), top: 0 }])
      .webp({ quality: 72, effort: 6 })
      .toFile(path.join(OUTPUT, `arena-${width}.webp`));
  }
}

async function icon(name, source) {
  await sharp(path.join(PUBLIC, source)).resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 86, effort: 6 }).toFile(path.join(OUTPUT, `${name}-96.webp`));
}

async function tierIcons() {
  for (let tier = 1; tier <= 7; tier += 1) {
    await sharp(path.join(PUBLIC, `bg-legacy/assset/tier${tier}.png`)).resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 86, effort: 6 }).toFile(path.join(OUTPUT, `tier-${tier}-48.webp`));
  }
}

await mkdir(OUTPUT, { recursive: true });
for (const [name, { source, focus }] of Object.entries(PLATES)) await plate(name, source, focus);
await arenaPlate();
for (const [name, source] of Object.entries(ICONS)) await icon(name, source);
await tierIcons();
