import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../src/features/Cosmetics.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/features/Cosmetics.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

const heroCardSource = component.match(
  /export function HeroSkinCard[\s\S]*?\n}\n\nfunction CoinCard/,
)?.[0] ?? '';

assert.ok(heroCardSource, 'HeroSkinCard source must be discoverable');
assert.doesNotMatch(heroCardSource, /<video|onPointerEnter|onPointerLeave|revealAnimation/);
assert.match(heroCardSource, /cosmetics-card-name/);
assert.doesNotMatch(heroCardSource, /cosmetics-card-meta|cosmetics-animated-badge/);

const cardStyles = styles.match(
  /\.cosmetics-card \{[\s\S]*?\n}\n\n\.cosmetics-card:hover/,
)?.[0] ?? '';

assert.match(cardStyles, /border:\s*0/);
assert.match(cardStyles, /background:\s*transparent/);
assert.match(cardStyles, /box-shadow:\s*none/);

const hoverStyles = styles.match(
  /\.cosmetics-card:hover,[\s\S]*?\n}\n/,
)?.[0] ?? '';

assert.doesNotMatch(hoverStyles, /transform:/);
assert.match(hoverStyles, /--cosmetics-tile-accent:\s*var\(--cosmetics-gold-bright\)/);

assert.match(component, /export function CosmeticsMediaLightbox/);
assert.match(component, /className="cosmetics-media-lightbox"/);
assert.match(component, /function cosmeticMediaSource/);
assert.match(component, /\/api\/cosmetics\/media\?url=/);
assert.match(component, /Анимация скина/);
assert.match(component, /Полный арт/);
assert.match(styles, /\.cosmetics-media-lightbox__panel/);
assert.match(
  app,
  /isGameDataSurfacePage[\s\S]*?\[[^\]]*'cosmetics'/,
  'cosmetics must opt into the parchment game-data shell instead of the white fallback shell',
);

console.log('Cosmetics UI contract tests passed');
