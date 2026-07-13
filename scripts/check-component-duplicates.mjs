import { readFileSync } from 'node:fs';

const FILES = ['src/App.tsx', 'src/features/DeferredRoutes.tsx'];
const MAX_DUPLICATE_COMPONENTS = 0;
const definitionPattern = /^(?:export\s+)?function\s+([A-Z][A-Za-z0-9_]*)\b/gm;

const fileSources = FILES.map(file => readFileSync(file, 'utf8'));
const componentSets = fileSources.map(source => new Set(
  [...source.matchAll(definitionPattern)].map(match => match[1]),
));
const duplicates = [...componentSets[0]].filter(name => componentSets[1].has(name)).sort();

console.log(`[architecture] duplicate named components: ${duplicates.length} / ${MAX_DUPLICATE_COMPONENTS}`);
for (const name of duplicates) console.log(`  - ${name}`);

if (duplicates.length > MAX_DUPLICATE_COMPONENTS) {
  console.error('[architecture] duplicate component count increased; move shared behavior into src/components instead');
  process.exit(1);
}

console.log('[architecture] single-owner component guard passed');

const deferredSource = fileSources[1];
const profileStart = deferredSource.indexOf('const profileName =');
const loginStart = deferredSource.indexOf('<div className="login-page"', profileStart);

if (profileStart < 0 || loginStart < 0) {
  console.error('[architecture] authenticated profile boundary could not be located');
  process.exit(1);
}

const profileInlineStyles = deferredSource
  .slice(profileStart, loginStart)
  .match(/\bstyle\s*=/g) || [];

console.log(`[architecture] authenticated profile inline styles: ${profileInlineStyles.length} / 0`);
if (profileInlineStyles.length > 0) {
  console.error('[architecture] authenticated profile presentation must remain owned by semantic CSS classes');
  process.exit(1);
}
