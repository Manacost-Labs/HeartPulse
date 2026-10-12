import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartDomain, lineCoordinates, csvDocument, formatChartValue } from '../src/shared/ui/analytics/analyticsModel';

test('a count domain never adds negative ticks', () => {
  assert.deepEqual(chartDomain([0, 3, 8], { minimum: 0 }), [0, 9]);
});
test('constant and missing series retain a finite scale', () => {
  const [low, high] = chartDomain([null, NaN, Infinity, 4, 4]);
  assert.ok(Number.isFinite(low) && high > low && low < 4 && high > 4);
  assert.deepEqual(chartDomain([null, NaN]), [0, 1]);
});
test('small percentages stay visible instead of acquiring a 0.1-point padding', () => {
  const [low, high] = chartDomain([0, 0.01, 0.03], { minimum: 0 });
  assert.equal(low, 0);
  assert.ok(high > 0.03 && high < 0.05);
});
test('an observed percentage range is padded by its spread instead of its absolute level', () => {
  const [low, high] = chartDomain([48.57, 48.58]);
  assert.ok(low < 48.57 && high > 48.58);
  assert.ok(high - low < 0.02, 'a 0.01-point change must not be flattened across five points');
});
test('turn gaps preserve their numeric coordinates', () => {
  const points = lineCoordinates([{ x: 1, y: 3 }, { x: 4, y: 5 }, { x: 16, y: 8 }]);
  assert.equal(points[1].position, 3 / 15);
});
test('missing observations do not turn into zero values', () => {
  const points = lineCoordinates([{ x: 1, y: 3 }, { x: 2, y: null }, { x: 3, y: 4 }]);
  assert.equal(points[1].y, null);
});
test('a small nonzero percentage is not labelled as zero', () => {
  assert.equal(formatChartValue(0.003, '%'), '0,003%');
  assert.equal(formatChartValue(317, 'count'), '317');
  assert.equal(formatChartValue(48.572, '%', 3), '48,572%');
  assert.equal(formatChartValue(null, '%'), '—');
});
test('CSV quotes multiline values and neutralizes spreadsheet formulas', () => {
  const csv = csvDocument(['Название', 'Число'], [['=HYPERLINK(1)', -2], ['a; b\n"c"', 0]]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=HYPERLINK(1)";-2'));
  assert.ok(csv.includes('"a; b\n""c""";0'));
});

test('browser charts remain accessible on mobile and export independent files', {
  skip: !process.env.STORYBOOK_QA_URL, timeout: 120_000,
}, async () => {
  const { default: puppeteer } = await import('puppeteer');
  const { mkdtemp, readFile, readdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createRequire } = await import('node:module');
  const downloads = await mkdtemp(join(tmpdir(), 'hearthpulse-charts-'));
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const visit = async (id: string, selector = '.analytics-chart, .analytics-table') => {
      await page.goto(`${process.env.STORYBOOK_QA_URL}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle0' });
      await page.waitForSelector(selector);
    };
    for (const id of ['shared-analytics--small-percentages', 'shared-analytics--dense-history', 'shared-analytics--missing-observations', 'shared-analytics--single-observation', 'shared-analytics--count-zero', 'shared-analytics--narrow-percentage-range', 'shared-analytics--empty', 'shared-analytics--placements', 'shared-analytics--tavern', 'shared-analytics--native-matrix', 'shared-analytics--selectable-bars', 'shared-analytics--empty-table', 'shared-analytics--compact-table', 'battlegrounds-analytics--hero-power', 'battlegrounds-analytics--tavern-distribution', 'battlegrounds-analytics--compositions', 'battlegrounds-round-analytics--rounds-with-gaps', 'meta-scatter-analytics--dense-meta', 'arena-classes-data--downloadable-chart', 'arena-classes-data--zero-winrate', 'admin-crm-overview--needs-attention', 'admin-crm-overview--all-calm', 'admin-crm-overview--empty-history', 'admin-crm-overview--single-day']) {
      await page.setViewport({ width: 390, height: 844 });
      await visit(id);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id}: page overflow`);
      if (id === 'shared-analytics--compact-table') assert.ok(await page.$eval('.analytics-table tbody tr', row => row.getBoundingClientRect().height <= 62), 'compact card rows preserve the previous 62px ceiling');
      if (id === 'shared-analytics--count-zero') assert.deepEqual(await page.$$eval('g:has(> .analytics-chart__grid) > text', labels => labels.map(label => label.textContent)), ['0', '1'], 'count ticks do not repeat rounded fractional labels');
      if (id === 'shared-analytics--narrow-percentage-range') {
        const labels = await page.$$eval('g:has(> .analytics-chart__grid) > text', labels => labels.map(label => label.textContent));
        assert.equal(new Set(labels).size, labels.length, 'percentage tick precision separates nearby values');
        assert.ok(labels.every(label => label?.startsWith('48,5')), 'observed narrow range stays readable');
      }
      await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (element: Element, options: object) => Promise<{ violations: Array<{ id: string }> }> } }).axe;
        return (await axe.run(document.querySelector('#storybook-root') as Element, {})).violations.map(item => item.id);
      });
      assert.deepEqual(violations, [], `${id}: accessibility`);
    }
    await visit('battlegrounds-trinket-distribution--zero-placements', '.bg-trinket-gallery-stats__distribution');
    assert.deepEqual(await page.$$eval('.bg-trinket-gallery-stats__distribution i', bars => bars.map(bar => bar.getBoundingClientRect().height === 0)), [false, false, true, true, false, false, false, false], 'zero placements remain visually zero');
    await page.setViewport({ width: 1280, height: 900 });
    await visit('shared-analytics--small-percentages');
    await page.focus('input[type=range]');
    await page.keyboard.press('End');
    assert.equal(await page.$eval('input[type=range]', element => (element as HTMLInputElement).value), '2');
    assert.match(await page.$eval('output', element => element.textContent ?? ''), /0,03%/);
    await page.keyboard.press('Home');
    assert.equal(await page.$eval('input[type=range]', element => (element as HTMLInputElement).value), '0');
    assert.match(await page.$eval('output', element => element.textContent ?? ''), /0,01%/);
    const downloaded = async (extension: string) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const filename = (await readdir(downloads)).find(name => name.endsWith(extension));
        if (filename) return readFile(join(downloads, filename));
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Missing ${extension} download`);
    };
    await page.click('button[aria-label$=SVG]');
    const svg = (await downloaded('.svg')).toString();
    assert.match(svg, /HearthPulse/); assert.match(svg, /Динамика карты/); assert.match(svg, /0,01%/);
    assert.doesNotMatch(svg, /<(script|foreignObject|image)[\s>]/);
    await page.click('button[aria-label$=PNG]');
    assert.deepEqual([...((await downloaded('.png')).subarray(0, 8))], [137, 80, 78, 71, 13, 10, 26, 10]);
    await visit('shared-analytics--paginated-table');
    await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.includes('страница 2'));
    await page.click('.analytics-table__tools button');
    const csv = (await downloaded('.csv')).toString();
    assert.equal(csv.split('\r\n').length, 27, 'CSV includes all 26 rows, including other pages');
    assert.match(csv.split('\r\n')[1], /1000/);
    assert.deepEqual(errors, [], 'No story interaction or runtime errors');
  } finally { await browser.close(); await rm(downloads, { recursive: true, force: true }); }
});
