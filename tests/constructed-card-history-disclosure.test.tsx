import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/features/ConstructedCardHistoryChart.tsx', import.meta.url),
  'utf8',
);

assert.match(source, /<details[^>]*className="constructed-card-history"/,
  'card history must use a native disclosure');
assert.doesNotMatch(source, /<details[^>]*\sopen(?:=|>)/,
  'card history disclosure must be collapsed by default');
assert.match(source, /<summary[^>]*>[\s\S]*Динамика карты[\s\S]*<\/summary>/,
  'the disclosure summary must identify the card history');

console.log('constructed-card history disclosure contracts passed');
