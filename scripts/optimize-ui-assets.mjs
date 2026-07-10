import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, 'public', 'class_icon');
const outputDir = path.join(sourceDir, 'ui');
const icons = [
  'deathknight',
  'demonhunter',
  'druid',
  'hunter',
  'mage',
  'paladin',
  'priest',
  'rogue',
  'shaman',
  'warlock',
  'warrior',
];

await mkdir(outputDir, { recursive: true });
await chmod(outputDir, 0o755);

await Promise.all(icons.map(async icon => {
  const input = path.join(sourceDir, `${icon}.png`);
  const output = path.join(outputDir, `${icon}-64.webp`);

  await sharp(input)
    .resize(64, 64, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 82, alphaQuality: 92, effort: 6 })
    .toFile(output);
  await chmod(output, 0o644);
}));

console.log(`Optimized ${icons.length} class icons for compact UI usage.`);
