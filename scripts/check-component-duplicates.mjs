import { readFileSync } from 'node:fs';

const FILES = ['src/app/shell/PublicPageShell.tsx', 'src/features/DeferredRoutes.tsx'];
const MAX_DUPLICATE_COMPONENTS = 0;
const definitionPattern = /^(?:export\s+)?function\s+([A-Z][A-Za-z0-9_]*)\b/gm;

const fileSources = FILES.map(file => readFileSync(file, 'utf8'));
const identityUiInlineStyles = names => names.flatMap(name => (
  readFileSync(`src/modules/identity/ui/${name}.tsx`, 'utf8').match(/\bstyle\s*=/g) || []
));
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
const cardModalStart = deferredSource.indexOf('const CardModal:');
const cardModalEnd = deferredSource.indexOf('// ─── HSCard', cardModalStart);

if (cardModalStart < 0 || cardModalEnd < 0) {
  console.error('[architecture] deferred presentation boundary could not be located');
  process.exit(1);
}

const profileInlineStyles = identityUiInlineStyles([
  'AccountDashboard', 'AccountAccessCard', 'AccountLinks', 'AccountContests', 'AccountSettings',
]);

console.log(`[architecture] authenticated profile inline styles: ${profileInlineStyles.length} / 0`);
if (profileInlineStyles.length > 0) {
  console.error('[architecture] authenticated profile presentation must remain owned by semantic CSS classes');
  process.exit(1);
}

const loginInlineStyles = identityUiInlineStyles(['LoginCard', 'SocialLoginLinks']);

console.log(`[architecture] public auth inline styles: ${loginInlineStyles.length} / 0`);
if (loginInlineStyles.length > 0) {
  console.error('[architecture] public auth presentation must remain owned by semantic CSS classes');
  process.exit(1);
}

const cardModalInlineStyles = deferredSource
  .slice(cardModalStart, cardModalEnd)
  .match(/\bstyle\s*=/g) || [];

console.log(`[architecture] card modal inline styles: ${cardModalInlineStyles.length} / 0`);
if (cardModalInlineStyles.length > 0) {
  console.error('[architecture] card modal presentation must remain owned by its lazy semantic stylesheet');
  process.exit(1);
}
