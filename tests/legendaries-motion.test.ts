import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');
const legendPage = source.slice(source.indexOf('export function Legendaries'));

assert.doesNotMatch(legendPage, /legendary-group-card anim-scale-in/,
  'legendary result cards must not restart an entry animation after their data is ready');
assert.doesNotMatch(legendPage, /animationDelay:\s*`\$\{Math\.min\(idx, 20\)/,
  'legendary result cards must not be staggered for up to 800ms after a route transition');

console.log('legendaries motion contracts passed');
