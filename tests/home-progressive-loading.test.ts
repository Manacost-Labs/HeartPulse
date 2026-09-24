import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homeSummaryData } from '../apps/public-web/lib/homeSummaryData';

const homeSource = readFileSync(new URL('../src/modules/home/ui/Home.tsx', import.meta.url), 'utf8');

assert.match(
  homeSource,
  /function DeferredHomeSection[\s\S]*IntersectionObserver/,
  'below-the-fold home sections must wait for viewport proximity before mounting their lazy modules',
);

assert.match(homeSource, /<DeferredHomeSection label="Последние статьи" eager=\{serverArticles\}>/,
  'Next can include latest articles in server HTML without changing legacy lazy loading');

for (const label of ['Поля Сражений', 'Арена', 'Частые вопросы']) {
  assert.match(
    homeSource,
    new RegExp(`<DeferredHomeSection label="${label}">`),
    `${label} must preserve its placeholder while its route-owned chunk is deferred`,
  );
}

console.log('home progressive-loading contracts passed');

const publicSummary = homeSummaryData({
  topClasses: [
    { id: 'mage', name: 'Маг', winrate: 55.4, privateRank: 1 },
    { id: 'broken', name: 'Нет данных', winrate: Number.NaN },
  ],
  viewer: { email: 'private@example.test' },
});
assert.deepEqual(publicSummary.topClasses, [{ id: 'mage', name: 'Маг', winrate: 55.4 }]);
assert.deepEqual(publicSummary.topCards, []);
assert.doesNotMatch(JSON.stringify(publicSummary), /privateRank|private@example/);
