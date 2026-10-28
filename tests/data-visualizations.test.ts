import assert from 'node:assert/strict';
import { test } from 'node:test';
import { axisLabelIndexes, axisLabelWidth, axisTicks, chartDomain, lineCoordinates, lineRuns, placeSegmentLabels, segmentStarts, csvDocument, formatChartValue } from '../src/shared/ui/analytics/analyticsModel';

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
test('axis ticks are round values inside the domain', () => {
  assert.deepEqual(axisTicks(0, 35), [0, 10, 20, 30]);
  assert.deepEqual(axisTicks(30, 70), [30, 40, 50, 60, 70]);
  assert.deepEqual(axisTicks(0, 1, true), [0, 1], 'counts never get fractional ticks');
  assert.deepEqual(axisTicks(0, 200_000, true), [0, 50_000, 100_000, 150_000, 200_000]);
});
test('a change of period breaks the line and marks a boundary', () => {
  const points = lineCoordinates([
    { x: 1, y: 2, segment: 'patch_36.6.3' }, { x: 2, y: 3, segment: 'patch_36.6.3' },
    { x: 3, y: 9, segment: 'black_empire' }, { x: 4, y: null, segment: 'black_empire' }, { x: 5, y: 8, segment: 'black_empire' },
  ]);
  assert.deepEqual(lineRuns(points).map(run => run.map(point => point.x)), [[1, 2], [3], [5]]);
  assert.deepEqual(segmentStarts(points), [2]);
  assert.deepEqual(segmentStarts(lineCoordinates([{ x: 1, y: 1 }, { x: 2, y: 2 }])), [], 'a series without periods has no boundary');
});
test('the newest period keeps its name when period labels collide', () => {
  const placed = placeSegmentLabels([
    { at: 0, label: 'Патч 36.0.3' }, { at: 300, label: 'Патч 36.6.3' }, { at: 395, label: 'Тёмная империя' },
  ], 0, 400);
  assert.deepEqual(placed.map(mark => [mark.shown, mark.anchorEnd]), [[true, false], [false, false], [true, true]]);
  assert.equal(placeSegmentLabels([{ at: 10, label: 'Патч 36.6.3' }], 0, 400)[0].anchorEnd, false);
});
test('date ticks keep the ends and never print over each other', () => {
  const extent = (centers: number[], widths: number[], ticks: number[]) => ticks.map((tick, index) => (index === 0
    ? [centers[tick], centers[tick] + widths[tick]]
    : index === ticks.length - 1 ? [centers[tick] - widths[tick], centers[tick]] : [centers[tick] - widths[tick] / 2, centers[tick] + widths[tick] / 2]));
  // The card history case: «21 окт, 10:36» labels, two points 20 px apart at both ends.
  const centers = [48, 68, 210, 330, 450, 560, 700, 820, 940, 1240, 1260];
  const widths = centers.map(() => axisLabelWidth('21 окт, 10:36'));
  const ticks = axisLabelIndexes(centers, widths);
  assert.equal(ticks[0], 0);
  assert.equal(ticks.at(-1), centers.length - 1);
  const boxes = extent(centers, widths, ticks);
  assert.ok(boxes.every((box, index) => index === 0 || box[0] >= boxes[index - 1][1] + 14), `labels overlap: ${JSON.stringify(boxes)}`);
  assert.ok(ticks.length >= 4, 'a wide plot still gets labels in between');
  assert.deepEqual(axisLabelIndexes([10], [80]), [0]);
  assert.deepEqual(axisLabelIndexes([10, 60], [80, 80]), [1], 'two labels that cannot both fit keep the latest');
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
  const { launchBrowser } = await import('../scripts/lib/browser-launch.mjs');
  const { mkdtemp, readFile, readdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createRequire } = await import('node:module');
  const downloads = await mkdtemp(join(tmpdir(), 'hearthpulse-charts-'));
  const browser = await launchBrowser({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
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
    for (const id of ['shared-analytics--small-percentages', 'shared-analytics--dense-history', 'shared-analytics--missing-observations', 'shared-analytics--single-observation', 'shared-analytics--count-zero', 'shared-analytics--narrow-percentage-range', 'shared-analytics--empty', 'shared-analytics--placements', 'shared-analytics--tavern', 'shared-analytics--native-matrix', 'shared-analytics--selectable-bars', 'shared-analytics--empty-table', 'shared-analytics--compact-table', 'battlegrounds-analytics--hero-power', 'battlegrounds-analytics--tavern-distribution', 'battlegrounds-analytics--compositions', 'battlegrounds-round-analytics--rounds-with-gaps', 'arena-classes-data--downloadable-chart', 'arena-classes-data--zero-winrate', 'admin-crm-overview--needs-attention', 'admin-crm-overview--all-calm', 'admin-crm-overview--empty-history', 'admin-crm-overview--single-day']) {
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
