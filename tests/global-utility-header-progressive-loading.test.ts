import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headerSource = readFileSync(new URL('../src/components/GlobalUtilityHeader.tsx', import.meta.url), 'utf8');

assert.match(
  headerSource,
  /if \(!helpOpen\) return undefined;[\s\S]*import\('\.\.\/features\/pageTour\/pageTourDefinitions'\)/,
  'the page-tour registry must wait until the visitor opens Help',
);

console.log('global utility-header progressive-loading contracts passed');
