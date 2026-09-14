import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homeSource = readFileSync(new URL('../src/features/Home.tsx', import.meta.url), 'utf8');

assert.match(
  homeSource,
  /function DeferredHomeSection[\s\S]*IntersectionObserver/,
  'below-the-fold home sections must wait for viewport proximity before mounting their lazy modules',
);

for (const label of ['Последние статьи', 'Поля Сражений', 'Арена', 'Частые вопросы']) {
  assert.match(
    homeSource,
    new RegExp(`<DeferredHomeSection label="${label}">`),
    `${label} must preserve its placeholder while its route-owned chunk is deferred`,
  );
}

console.log('home progressive-loading contracts passed');
