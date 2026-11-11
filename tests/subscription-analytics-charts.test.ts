import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { SubscriptionMetrics } from '../src/modules/subscriptionAnalytics/model/types.js';
import {
  dailyChartPoints, formatShortDate, planSeries, planShareRows, rankPlans, unobservedDayCount, unobservedRanges, weeklyChartPoints,
} from '../src/modules/subscriptionAnalytics/model/subscriptionCharts.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/boosty-subscription-metrics-sample-20261111.json', import.meta.url), 'utf8')) as SubscriptionMetrics;

describe('графики подписок на образце', () => {
  it('формат даты — день и месяц по-русски', () => {
    assert.equal(formatShortDate('2026-09-02'), '2 сен');
    assert.equal(formatShortDate('2026-05-31'), '31 мая');
    assert.equal(formatShortDate('мусор'), 'мусор');
  });

  it('дни без наблюдений разрывают линию и идут пунктиром', () => {
    const points = dailyChartPoints(sample.daily);
    assert.equal(points.length, sample.daily.length);
    sample.daily.forEach((day, index) => {
      if (day.observed) assert.equal(points[index].y, day.paid);
      else {
        assert.equal(points[index].y, null);
        assert.equal(points[index].reference, day.paid);
        assert.match(points[index].label ?? '', /нет наблюдений/);
      }
    });
    // Пунктир касается линии: соседние наблюдаемые дни тоже получают опорное значение.
    const firstGap = sample.daily.findIndex(day => !day.observed);
    assert.equal(points[firstGap - 1].reference, sample.daily[firstGap - 1].paid);
    assert.equal(points[firstGap - 1 - 1].reference, null);
  });

  it('в подсказке дня — разбивка по тарифам', () => {
    const last = dailyChartPoints(sample.daily).at(-1)!;
    assert.match(last.detail ?? '', /Алмаз 317/);
    assert.match(last.detail ?? '', /Таверна Боба 56/);
  });

  it('диапазоны пропусков считаются подряд идущими днями', () => {
    const ranges = unobservedRanges(sample.daily);
    assert.equal(unobservedDayCount(sample.daily), sample.daily.filter(day => !day.observed).length);
    assert.ok(ranges.length >= 1 && ranges.every(range => range.length > 0));
    assert.equal(unobservedRanges([{ date: '2026-09-01', paid: 1, plans: {}, starts: 0, ends: 0, observed: true }]).length, 0);
    assert.deepEqual(unobservedRanges([
      { date: '2026-09-01', paid: 1, plans: {}, starts: 0, ends: 0, observed: false },
      { date: '2026-09-02', paid: 1, plans: {}, starts: 0, ends: 0, observed: false },
      { date: '2026-09-03', paid: 1, plans: {}, starts: 0, ends: 0, observed: true },
      { date: '2026-09-04', paid: 1, plans: {}, starts: 0, ends: 0, observed: false },
    ]), ['1 сен — 2 сен', '4 сен']);
  });

  it('доли тарифов: ровно шесть наблюдаемых дат, каждая даёт 100 %', () => {
    const plans = rankPlans(sample.daily);
    assert.equal(plans[0], 'Алмаз');
    const rows = planShareRows(sample.daily, plans);
    assert.equal(rows.length, 6);
    assert.equal(rows.at(-1)!.label, '11 ноя');
    for (const row of rows) assert.ok(Math.abs(Object.values(row.values).reduce((sum, value) => sum + value, 0) - 100) < 1e-9);
    assert.deepEqual(planSeries(sample.daily, plans).map(item => item.label), plans);
  });

  it('тарифы сверх лимита сливаются в «Другие»', () => {
    const plans = rankPlans(sample.daily, 2);
    const series = planSeries(sample.daily, plans);
    assert.deepEqual(series.map(item => item.label), [...plans, 'Другие']);
    const row = planShareRows(sample.daily, plans).at(-1)!;
    assert.ok(row.values.__other > 0);
    assert.ok(Math.abs(Object.values(row.values).reduce((sum, value) => sum + value, 0) - 100) < 1e-9);
  });

  it('пустой ряд не падает', () => {
    assert.deepEqual(planShareRows([]), []);
    assert.deepEqual(dailyChartPoints([]), []);
    assert.deepEqual(weeklyChartPoints([]), []);
  });

  it('недели: начала и окончания, неполная неделя в своём сегменте', () => {
    const points = weeklyChartPoints(sample.weekly);
    assert.equal(points.length, sample.weekly.length);
    sample.weekly.forEach((week, index) => {
      assert.equal(points[index].y, week.starts);
      assert.equal(points[index].reference, week.ends);
      assert.equal(points[index].segment, week.partial ? 'partial' : 'full');
    });
    assert.match(points.at(-1)!.label ?? '', /неполная/);
  });
});
