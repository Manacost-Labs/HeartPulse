import { readFileSync } from 'node:fs';

const FILES = ['src/App.tsx', 'src/features/DeferredRoutes.tsx'];
const MAX_DUPLICATE_COMPONENTS = Number(process.env.MAX_DUPLICATE_COMPONENTS || 23);
const definitionPattern = /^(?:export\s+)?function\s+([A-Z][A-Za-z0-9_]*)\b/gm;

const componentSets = FILES.map(file => new Set(
  [...readFileSync(file, 'utf8').matchAll(definitionPattern)].map(match => match[1]),
));
const duplicates = [...componentSets[0]].filter(name => componentSets[1].has(name)).sort();

console.log(`[architecture] duplicate named components: ${duplicates.length} / ${MAX_DUPLICATE_COMPONENTS}`);
for (const name of duplicates) console.log(`  - ${name}`);

if (duplicates.length > MAX_DUPLICATE_COMPONENTS) {
  console.error('[architecture] duplicate component count increased; move shared behavior into src/components instead');
  process.exit(1);
}

console.log('[architecture] no-growth guard passed; ratchet MAX_DUPLICATE_COMPONENTS down after each extraction batch');
