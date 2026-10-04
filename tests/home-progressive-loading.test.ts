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

// The two directories and the FAQ are static links and text. A placeholder
// a third of their height shifted the page when they mounted, and the
// page index linked to headings that did not exist yet, so they render in
// the document like any other section.
for (const label of ['Поля Сражений', 'Арена', 'Частые вопросы']) {
  assert.doesNotMatch(homeSource, new RegExp(`<DeferredHomeSection label="${label}"`),
    `${label} renders with the page instead of behind a placeholder`);
}
assert.match(homeSource, /^import HomeArenaDirectory from '\.\/HomeArenaDirectory';$/m);
assert.match(homeSource, /^import HomeBattlegrounds from '\.\/HomeBattlegrounds';$/m);
assert.doesNotMatch(homeSource, /React\.lazy\(\(\) => import\('\.\/Home(ArenaDirectory|Battlegrounds)'\)\)/,
  'a lazy section would leave its stylesheet out of the document');
for (const anchor of ['home-articles-heading', 'home-bg-heading', 'home-arena-directory-heading', 'faq-heading']) {
  assert.match(homeSource, new RegExp(`href="#${anchor}"`), `the page index links to #${anchor}`);
}
assert.match(homeSource, /<LoadingSurface[^>]*label=\{`Загружаем раздел «\$\{label\}»`\}/,
  'the remaining deferred section waits behind the shared loading surface');

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
