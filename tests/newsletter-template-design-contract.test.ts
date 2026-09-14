import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');

assert.match(serverSource, /function renderNewsletterHtml[\s\S]*?#ead6a7/,
  'newsletter shell must use the project parchment material');
assert.match(serverSource, /function renderNewsletterHtml[\s\S]*?arena-parchment\.jpg/,
  'newsletter shell must use the prepared parchment asset');
assert.match(serverSource, /function renderNewsletterHtml[\s\S]*?arena-rail-red\.jpg/,
  'newsletter header must use the prepared tavern-cloth asset');
assert.match(serverSource, /function renderNewsletterHtml[\s\S]*?#8d171d[\s\S]*?#30251c/,
  'newsletter shell must retain the project red and ink palette');

console.log('newsletter template design contract assertions passed');
