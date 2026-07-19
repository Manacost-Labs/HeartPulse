import assert from 'node:assert/strict';
import { articleAccessEntitlement, type ArticleAccessMode } from '../server/articleAccess.js';

const cases: Array<[ArticleAccessMode, string | null]> = [
  ['arena', 'arenaArticles'],
  ['battlegrounds', 'battlegroundsArticles'],
  ['standard', 'standard'],
  ['wild', 'standard'],
  ['general', null],
];

for (const [mode, expected] of cases) {
  assert.equal(articleAccessEntitlement(mode), expected, `wrong entitlement for ${mode}`);
}

console.log('article access entitlement tests passed');
