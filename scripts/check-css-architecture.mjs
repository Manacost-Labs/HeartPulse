import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const TOKEN_FILE = 'src/styles/tokens.css';
const MAX_IMPORTANT_DECLARATIONS = 2716;

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

console.log(`[css-architecture] global :root owners: ${rootOwners.length} / 1`);
console.log(`[css-architecture] unique global tokens: ${tokenNames.length}`);
console.log(`[css-architecture] !important declarations: ${importantCount} / ${MAX_IMPORTANT_DECLARATIONS}`);

if (importantCount > MAX_IMPORTANT_DECLARATIONS) {
  console.error('[css-architecture] legacy cascade debt increased; remove an override or use scoped specificity instead');
  process.exit(1);
}

console.log('[css-architecture] cascade no-growth guard passed');
