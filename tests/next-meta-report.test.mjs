import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { PAID_SENTINELS } from './helpers/metaReportFixture.ts';
import { LEAKED, startMetaReportStand } from './helpers/metaReportStand.mjs';

// The weekly meta report pages as a guest and a crawler get them, server-rendered from the
// snapshots (docs/specs/meta-report-snapshots.md, «Report pages»): 30 November is compared with
// 23 November (one HSGuru period), 7 December is not (the period changed), 23 November is the first.

const decoded = text => text.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').replaceAll(' ', ' ');
const plain = html => decoded(html.replaceAll('<!-- -->', '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const main = html => html.slice(html.indexOf('<main'), html.indexOf('</main>'));
/** The rows of the table under the heading with this id, cell texts joined with « | ». */
function tableRows(html, headingId) {
  const start = html.indexOf(`id="${headingId}"`);
  const table = html.slice(start, html.indexOf('</table>', start));
  return [...table.matchAll(/<tbody>([\s\S]*)<\/tbody>/g)].flatMap(body => [...body[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)])
    .map(row => [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(cell => plain(cell[1])).join(' | '));
}
const links = html => [...main(html).matchAll(/<a\b[^>]*href="([^"]*)"/g)].map(match => match[1]);
// Next adds its own noindex to a 404 next to the one of the not-found page: every robots tag must say noindex.
const noindexed = html => {
  const robots = meta(html, 'robots');
  return robots.length > 0 && robots.every(value => value.startsWith('noindex'));
};
const meta = (html, name) => [...html.matchAll(new RegExp(`<meta name="${name}" content="([^"]*)"`, 'g'))].map(match => decoded(match[1]));

test('a report prints the snapshot with the change to the previous week of the same HSGuru period', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const stand = await startMetaReportStand();
  try {
    const response = await fetch(`${stand.origin}/reports/meta/2026-11-30/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.deepEqual([...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(match => plain(match[1])),
      ['Мета Hearthstone на 30 ноября 2026: еженедельный отчёт']);
    assert.match(html, /<title>Мета Hearthstone на 30 ноября 2026: еженедельный отчёт \| HearthPulse<\/title>/);
    assert.deepEqual(meta(html, 'description'), ['Мета Hearthstone на 30 ноября 2026: лидер по винрейту — Йогг Воин (60,2%), '
      + 'самый популярный — Зоо Чернокнижник (10,4%). Стандарт, матчапы, классы Арены и герои Полей сражений.']);
    assert.deepEqual(meta(html, 'robots'), ['noindex, follow'], 'reports stay out of the index until SEO-A indexes them');
    assert.deepEqual([...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map(match => match[1]),
      ['https://hearthpulse.net/reports/meta/2026-11-30/']);

    assert.deepEqual(tableRows(html, 'meta-report-standard-winrate'), [
      '1 | Йогг Воин | 60,2% +1,1 п.п. | 3,0% +0,1 п.п. | 8 100 +2 100 за неделю',
      '2 | Зоо Чернокнижник | 56,9% −0,6 п.п. | 10,4% +0,6 п.п. | 26 000 +6 000 за неделю',
      '3 | Большой Шаман новый в топе | 55,5% | 1,2% | 3 000',
      '4 | Вор Жрец | 54,0% −0,1 п.п. | 4,2% +0,2 п.п. | 10 500 +2 500 за неделю',
      '5 | ДК Крови | 53,1% +1,1 п.п. | 8,1% −0,7 п.п. | 22 000 +4 000 за неделю',
    ], 'a rare archetype (0.4 %) is not ranked by winrate');
    const text = plain(main(html));
    for (const line of [
      'Изменения — к отчёту на 23 ноября 2026',
      'Выбыли из топа: Редкость 5.',
      'Данные на 30 ноября 2026, 03:00 МСК · источник HSGuru.',
      'Зоо Чернокнижник Лучший матчап: ДК Крови — 52,9% (32 997 игр). Худший матчап: Вор Жрец — 44,8% (197 688 игр).',
      'Вор Жрец Лучший матчап: Зоо Чернокнижник — 55,2% (197 688 игр). Худший матчап: нет пары с достаточной выборкой.',
      'Рыцарь смерти — 52,3%, 1 308 забегов',
      'Мало данных (меньше 100 забегов), без места в рейтинге: Друид (89), Охотник на демонов (35).',
      'Лорд Джараксус — тир A, среднее место 3,98, топ-4 59,6%',
      'Последний патч на день среза — патч 37.0.2 (3 ноября 2026).',
    ]) assert.ok(text.includes(line), `the report says «${line}»`);
    assert.ok(!text.includes('Безымянный'), 'a hero without an average place is not ranked');

    const hrefs = links(html);
    for (const href of ['/standard/archetypes/standard/zoo-warlock/', '/standard/archetypes/standard/yogg-warrior/', '/heroes/59807/',
      '/heroes/60370/', '/reports/meta/2026-11-23/', '/reports/meta/2026-12-07/', '/reports/meta/', '/standard/meta/',
      '/standard/matchups/', '/classes/', '/heroes/', '/standard/patches/']) assert.ok(hrefs.includes(href), `links ${href}`);
    for (const href of ['/standard/archetypes/standard/thief-priest/', '/standard/archetypes/standard/big-shaman/']) {
      assert.ok(!hrefs.includes(href), `${href} is not an indexable archetype page, so it is not linked`);
    }
  } finally {
    await stand.close();
  }
});

test('no change across a new HSGuru period, none for the first report; nothing paid in HTML, RSC or JSON-LD', async () => {
  const stand = await startMetaReportStand();
  try {
    const changed = await (await fetch(`${stand.origin}/reports/meta/2026-12-07/`)).text();
    assert.deepEqual(tableRows(changed, 'meta-report-standard-winrate'), [
      '1 | Йогг Воин | 58,0% | 2,5% | 1 500',
      '2 | ДК Крови | 55,4% | 9,1% | 5 200',
      '3 | Зоо Чернокнижник | 51,0% | 7,0% | 4 000',
    ]);
    const changedText = plain(main(changed));
    assert.ok(changedText.includes('С прошлого отчёта сменился период HSGuru (Патч 37.0.2 → Патч 37.2.0)'));
    assert.ok(changedText.includes('На этой неделе вышел патч 37.2.0 (3 декабря 2026).'));
    assert.ok(!changedText.includes('п.п.') && !changedText.includes('Выбыли'), 'no difference between periods');
    assert.ok(!links(changed).some(href => href === '/reports/meta/2026-12-14/'), 'the newest report has no next one');

    const first = await (await fetch(`${stand.origin}/reports/meta/2026-11-23/`)).text();
    const firstText = plain(main(first));
    assert.ok(firstText.includes('Это первый отчёт, изменений к прошлой неделе нет.'));
    assert.ok(!firstText.includes('п.п.') && !firstText.includes('новый в топе'));

    const archive = await (await fetch(`${stand.origin}/reports/meta/`)).text();
    assert.deepEqual(meta(archive, 'robots'), ['noindex, follow']);
    assert.deepEqual(links(archive).filter(href => href.startsWith('/reports/meta/2')),
      ['/reports/meta/2026-12-07/', '/reports/meta/2026-11-30/', '/reports/meta/2026-11-23/']);

    for (const [path, html] of [['/reports/meta/2026-12-07/', changed], ['/reports/meta/2026-11-23/', first], ['/reports/meta/', archive]]) {
      assert.ok(html.includes('self.__next_f.push'), `${path} carries an RSC payload, so the check is not vacuous`);
      assert.deepEqual([...LEAKED, ...PAID_SENTINELS].filter(value => html.includes(value)), [], `${path} holds no paid value`);
      assert.ok(!html.includes('"@type":"Dataset"'), `${path} is noindex, so it has no Dataset JSON-LD yet`);
    }
  } finally {
    await stand.close();
  }
});

test('an unknown or impossible date and an empty archive are noindex 404s', async () => {
  const stand = await startMetaReportStand();
  try {
    for (const path of ['/reports/meta/2026-11-24/', '/reports/meta/2026-02-30/', '/reports/meta/latest/']) {
      const response = await fetch(`${stand.origin}${path}`);
      assert.equal(response.status, 404, path);
      assert.deepEqual(noindexed(await response.text()), true, path);
    }
  } finally {
    await stand.close();
  }
  const empty = await startMetaReportStand({ empty: true });
  try {
    for (const path of ['/reports/meta/', '/reports/meta/2026-11-23/']) {
      const response = await fetch(`${empty.origin}${path}`);
      assert.equal(response.status, 404, path);
      assert.deepEqual(noindexed(await response.text()), true, path);
    }
  } finally {
    await empty.close();
  }
});
