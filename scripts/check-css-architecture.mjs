import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const TOKEN_FILE = 'src/styles/tokens.css';
const MAX_IMPORTANT_DECLARATIONS = 2321;
const RETIRED_HOME_CLASS_PREFIXES = [
  'home-stage__atmosphere',
  'home-stage__rune',
  'home-stage__spark',
  'home-draft-orbit__circle',
  'home-draft-orbit__mana',
  'home-stage__status',
  'home-live-dot',
  'home-tool-path',
  'home-tool-step',
  'home-arena-board',
  'home-data__layout',
  'home-ranking',
  'home-card-strip',
  'home-subheading',
  'draft-card-rail',
  'draft-card-item',
  'draft-card-image',
  'home-bg-spotlight',
  'home-bg-chart',
];
const RETIRED_INITIAL_CLASS_PREFIXES = [
  'community-promo-card',
  'bg-parchment-inactive',
  'hs-input',
  'text-gold',
  'anim-fade-left',
  'route-transition',
  'hs-card-interactive',
  'hs-btn',
  'gold-pulse',
  'arena-header',
  'arena-brand-card',
  'site-switcher',
  'arena-tabs',
  'arena-tab',
  'home-summary',
  'home-boosty-banner',
  'modern-primary-link',
  'modern-secondary-link',
  'modern-mini-stat',
  'arena-mobile-menu-sublink',
  'arena-sidebar-sublink',
  'home-section-heading--data',
];

function walk(directory) {
  return readdirSync(directory)
    .flatMap(name => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

const cssFiles = walk(SRC).filter(path => path.endsWith('.css'));
const sources = cssFiles.map(path => ({
  file: relative(ROOT, path),
  source: readFileSync(path, 'utf8'),
}));

const rootOwners = sources
  .filter(({ source }) => /^\s*:root\b/m.test(source))
  .map(({ file }) => file);

if (rootOwners.length !== 1 || rootOwners[0] !== TOKEN_FILE) {
  console.error(`[css-architecture] :root must be owned only by ${TOKEN_FILE}; found: ${rootOwners.join(', ') || 'none'}`);
  process.exit(1);
}

const tokenSource = readFileSync(join(ROOT, TOKEN_FILE), 'utf8');
const tokenNames = [...tokenSource.matchAll(/--([a-z0-9-]+)\s*:/gi)].map(match => match[1]);
const duplicateTokens = [...new Set(tokenNames.filter((name, index) => tokenNames.indexOf(name) !== index))];

if (duplicateTokens.length > 0) {
  console.error(`[css-architecture] duplicate global tokens: ${duplicateTokens.join(', ')}`);
  process.exit(1);
}

const indexSource = readFileSync(join(SRC, 'index.css'), 'utf8');
const expectedImports = '@import "tailwindcss";\n@import "./styles/tokens.css";';

if (!indexSource.startsWith(expectedImports)) {
  console.error('[css-architecture] index.css must load Tailwind first and canonical tokens second');
  process.exit(1);
}

const importantCount = sources.reduce(
  (count, { source }) => count + (source.match(/!important\b/g) || []).length,
  0,
);

const retiredHomeSelectors = sources.flatMap(({ file, source }) => (
  RETIRED_HOME_CLASS_PREFIXES
    .filter(prefix => new RegExp(`\\.${prefix}(?:__|--|(?![\\w-]))`).test(source))
    .map(prefix => `${file}:.${prefix}`)
));
const retiredInitialSelectors = sources.flatMap(({ file, source }) => (
  RETIRED_INITIAL_CLASS_PREFIXES
    .filter(prefix => new RegExp(`\\.${prefix}(?:__|--|(?![\\w-]))`).test(source))
    .map(prefix => `${file}:.${prefix}`)
));

if (retiredHomeSelectors.length > 0) {
  console.error(`[css-architecture] retired ownerless Home selectors returned: ${retiredHomeSelectors.join(', ')}`);
  process.exit(1);
}

if (retiredInitialSelectors.length > 0) {
  console.error(`[css-architecture] retired ownerless initial selectors returned: ${retiredInitialSelectors.join(', ')}`);
  process.exit(1);
}

console.log(`[css-architecture] global :root owners: ${rootOwners.length} / 1`);
console.log(`[css-architecture] unique global tokens: ${tokenNames.length}`);
console.log(`[css-architecture] !important declarations: ${importantCount} / ${MAX_IMPORTANT_DECLARATIONS}`);
console.log(`[css-architecture] retired ownerless Home selector prefixes: 0 / ${RETIRED_HOME_CLASS_PREFIXES.length}`);
console.log(`[css-architecture] retired ownerless initial selector prefixes: 0 / ${RETIRED_INITIAL_CLASS_PREFIXES.length}`);

if (importantCount > MAX_IMPORTANT_DECLARATIONS) {
  console.error('[css-architecture] legacy cascade debt increased; remove an override or use scoped specificity instead');
  process.exit(1);
}

console.log('[css-architecture] cascade no-growth guard passed');
