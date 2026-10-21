import assert from 'node:assert/strict';
import {
  AUTO_TOUR_OPT_OUT_KEY,
  isAutomatedVisitor,
  pageTourQueryIntent,
  shouldAutoStartPageTour,
} from '../src/features/pageTour/pageTourAutoStart.js';

const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const storage = (entries: Record<string, string>) => ({ getItem: (key: string) => entries[key] ?? null });
const key = 'manacost:page-tour:standard-meta:v4';
const visitor = { storage: storage({}), storageKey: key, userAgent: chrome, webdriver: false, search: '' };

assert.equal(shouldAutoStartPageTour(visitor), true, 'a new visitor sees the tour once');
for (const status of ['completed', 'dismissed', 'in-progress']) {
  assert.equal(
    shouldAutoStartPageTour({ ...visitor, storage: storage({ [key]: JSON.stringify({ status }) }) }),
    false,
    `a ${status} tour of this version does not start again by itself`,
  );
}
assert.equal(
  shouldAutoStartPageTour({ ...visitor, storage: storage({ 'manacost:page-tour:standard-meta:v3': '{"status":"completed"}' }) }),
  true,
  'a new tour version is shown again',
);
assert.equal(
  shouldAutoStartPageTour({ ...visitor, storage: storage({ [AUTO_TOUR_OPT_OUT_KEY]: '1' }) }),
  false,
  '«Больше не показывать» stops automatic tours on every page',
);
assert.equal(shouldAutoStartPageTour({ ...visitor, storageKey: undefined }), true, 'the visitor-wide check runs without a tour key');
assert.equal(shouldAutoStartPageTour({ ...visitor, storage: null }), false, 'without storage the tour would repeat on every visit');
assert.equal(
  shouldAutoStartPageTour({ ...visitor, storage: { getItem: () => { throw new Error('denied'); } } }),
  false,
  'blocked storage never starts a tour',
);
assert.equal(shouldAutoStartPageTour({ ...visitor, webdriver: true }), false, 'automated browsers never get an automatic tour');
assert.equal(shouldAutoStartPageTour({ ...visitor, search: '?tour=0' }), false, '?tour=0 keeps the tour closed');

for (const bot of ['Googlebot/2.1', 'Mozilla/5.0 (compatible; YandexBot/3.0)', 'facebookexternalhit/1.1', 'Mozilla/5.0 HeadlessChrome/141.0', 'Chrome-Lighthouse']) {
  assert.equal(isAutomatedVisitor(bot, false), true, `${bot} is a crawler`);
}
assert.equal(isAutomatedVisitor(chrome, false), false);
assert.equal(isAutomatedVisitor('Mozilla/5.0 (Linux; Android 14) YaBrowser/25.6 Mobile Safari/537.36', false), false, 'Yandex Browser is a person');

assert.equal(pageTourQueryIntent('?tour=1'), 'open');
assert.equal(pageTourQueryIntent('?format=wild&tour=0'), 'never');
assert.equal(pageTourQueryIntent('?tour=yes'), null);

console.log('page tour auto-start contracts passed');
