import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const WIKI_FILE_REDIRECT = 'https://hearthstone.wiki.gg/wiki/Special:Redirect/file/';
const OUTPUT_ROOT = path.resolve('public/constructed-filter-icons');
const SET_OUTPUT_ROOT = path.join(OUTPUT_ROOT, 'sets');
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FORCE = process.argv.includes('--force');
const resolvedWikiImageUrls = new Map();

const setLogos = {
  ESCAPEFROM_VIOLET_HOLD: 'Escape from Violet Hold - SVG logo.svg',
  CATACLYSM: 'CATACLYSM - SVG logo.svg',
  TIME_TRAVEL: 'Across the Timeways - SVG logo.svg',
  THE_LOST_CITY: "The Lost City of Un'Goro - SVG logo.svg",
  EMERALD_DREAM: 'Into the Emerald Dream - SVG logo.svg',
  SPACE: 'The Great Dark Beyond - SVG logo.svg',
  ISLAND_VACATION: 'Perils in Paradise - SVG logo.svg',
  WHIZBANGS_WORKSHOP: "Whizbang's Workshop - SVG logo.svg",
  WILD_WEST: 'Showdown in the Badlands - SVG logo.svg',
  WONDERS: 'Caverns of Time - SVG logo.svg',
  TITANS: 'TITANS - SVG logo.svg',
  BATTLE_OF_THE_BANDS: 'Festival of Legends - SVG logo.svg',
  RETURN_OF_THE_LICH_KING: 'March of the Lich King - SVG logo.svg',
  PATH_OF_ARTHAS: 'Path of Arthas - SVG logo.svg',
  REVENDRETH: 'Murder at Castle Nathria - SVG logo.svg',
  THE_SUNKEN_CITY: 'Voyage to the Sunken City - SVG logo.svg',
  ALTERAC_VALLEY: 'Fractured in Alterac Valley - SVG logo.svg',
  STORMWIND: 'United in Stormwind - SVG logo.svg',
  THE_BARRENS: 'Forged in the Barrens - SVG logo.svg',
  DARKMOON_FAIRE: 'Madness at the Darkmoon Faire - SVG logo.svg',
  SCHOLOMANCE: 'Scholomance Academy - SVG logo.svg',
  BLACK_TEMPLE: 'Ashes of Outland - SVG logo.svg',
  YEAR_OF_THE_DRAGON: "Galakrond's Awakening - SVG logo.svg",
  DRAGONS: 'Descent of Dragons - SVG logo.svg',
  ULDUM: 'Saviors of Uldum - SVG logo.svg',
  DALARAN: 'Rise of Shadows - SVG logo.svg',
  TROLL: "Rastakhan's Rumble - SVG logo.svg",
  BOOMSDAY: 'The Boomsday Project - SVG logo.svg',
  GILNEAS: 'The Witchwood - SVG logo.svg',
  LOOTAPALOOZA: 'Kobolds and Catacombs - SVG logo.svg',
  ICECROWN: 'Knights of the Frozen Throne - SVG logo.svg',
  UNGORO: "Journey to Un'Goro - SVG logo.svg",
  GANGS: 'Mean Streets of Gadgetzan - SVG logo.svg',
  KARA: 'One Night in Karazhan - SVG logo.svg',
  OG: 'Whispers of the Old Gods - SVG logo.svg',
  LOE: 'League of Explorers - SVG logo.svg',
  TGT: 'The Grand Tournament - SVG logo.svg',
  BRM: 'Blackrock Mountain - SVG logo.svg',
  GVG: 'Goblins vs Gnomes - SVG logo.svg',
  NAXX: 'Curse of Naxxramas - SVG logo.svg',
  DEMON_HUNTER_INITIATE: 'Demon Hunter Initiate - SVG logo.svg',
  EXPERT1: 'Classic - SVG logo.svg',
  CORE: 'CoreIcon Even3.png',
  LEGACY: 'Hall of Fame - SVG logo.svg',
  EVENT: 'Event - SVG logo.svg',
};

const statIcons = {
  attack: 'Attack.png',
  health: 'Health.png',
};

function wikiFileUrl(filename) {
  return `${WIKI_FILE_REDIRECT}${encodeURIComponent(filename)}`;
}

async function resolveWikiImageUrls(filenames) {
  const params = new URLSearchParams({
    action: 'query',
    titles: filenames.map(filename => `File:${filename}`).join('|'),
    prop: 'imageinfo',
    iiprop: 'url',
    format: 'json',
    formatversion: '2',
  });
  const response = await fetch(`https://hearthstone.wiki.gg/api.php?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ManacostArenaAssetSync/1.0 (+https://hearthpulse.net)',
    },
  });
  if (!response.ok) throw new Error(`Wiki image lookup: HTTP ${response.status}`);
  const payload = await response.json();
  for (const page of payload?.query?.pages || []) {
    const filename = String(page?.title || '').replace(/^File:/, '');
    const imageUrl = page?.imageinfo?.[0]?.url;
    if (filename && imageUrl) resolvedWikiImageUrls.set(filename, imageUrl);
  }
}

async function fetchWikiImage(filename) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(resolvedWikiImageUrls.get(filename) || wikiFileUrl(filename), {
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*',
          'User-Agent': 'ManacostArenaAssetSync/1.0 (+https://hearthpulse.net)',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      if (response.status === 429 && attempt < 4) {
        const retryAfterSeconds = Number(response.headers.get('retry-after')) || attempt + 2;
        await new Promise(resolve => setTimeout(resolve, Math.min(retryAfterSeconds, 10) * 1_000));
        continue;
      }
      if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
      const responseHost = new URL(response.url).hostname;
      if (responseHost !== 'wiki.gg' && !responseHost.endsWith('.wiki.gg')) {
        throw new Error(`${filename}: unexpected redirect host ${response.url}`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/') && !contentType.includes('svg')) {
        throw new Error(`${filename}: unexpected content type ${contentType || 'unknown'}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) {
        throw new Error(`${filename}: invalid source size ${bytes.length}`);
      }
      return bytes;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${filename}: retry limit reached`);
}

async function writeWebp(filename, output, width, height) {
  if (!FORCE) {
    try {
      await access(output);
      process.stdout.write(`kept ${path.relative(process.cwd(), output)}\n`);
      return;
    } catch {
      // Missing files are downloaded below.
    }
  }
  const source = await fetchWikiImage(filename);
  await sharp(source, { limitInputPixels: 20_000_000 })
    .resize({ width, height, fit: 'inside', withoutEnlargement: false })
    .webp({ quality: 88, alphaQuality: 92, effort: 5 })
    .toFile(output);
  process.stdout.write(`synced ${path.relative(process.cwd(), output)}\n`);
  await new Promise(resolve => setTimeout(resolve, 250));
}

await mkdir(SET_OUTPUT_ROOT, { recursive: true });
await resolveWikiImageUrls([...Object.values(setLogos), ...Object.values(statIcons)]);

for (const [setCode, filename] of Object.entries(setLogos)) {
  await writeWebp(
    filename,
    path.join(SET_OUTPUT_ROOT, `${setCode.toLocaleLowerCase('en-US')}.webp`),
    180,
    72,
  );
}

for (const [name, filename] of Object.entries(statIcons)) {
  await writeWebp(filename, path.join(OUTPUT_ROOT, `${name}.webp`), 72, 72);
}

await writeFile(
  path.join(OUTPUT_ROOT, 'sources.json'),
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'https://hearthstone.wiki.gg/wiki/Category:Game_assets',
    logoReference: 'https://hearthstone.wiki.gg/wiki/Logo',
    setLogos,
    statIcons,
  }, null, 2)}\n`,
);
