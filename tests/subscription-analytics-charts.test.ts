import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { SubscriptionMetrics } from '../src/modules/subscriptionAnalytics/model/types.js';
import {
  baseValueView, formatHours, formatMoment, partialWeekNotes, retentionView, sortedTransitions, transitionLabel,
} from '../src/modules/subscriptionAnalytics/model/subscriptionBlocks.js';
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

describe('блоки подписок: чистая модель', () => {
  it('главный вывод — средний тариф снизился, прирост стоит дешевле прежнего среднего', () => {
    const view = baseValueView(sample);
    assert.equal(view.takeaway?.tone, 'down');
    assert.equal(view.takeaway?.headline, 'Средний тариф снизился: 207 ₽ → 193 ₽ (−14 ₽)');
    assert.match(view.takeaway?.detail ?? '', /тариф 160 ₽ в месяц — ниже прежнего среднего/);
    assert.match(view.takeaway?.detail ?? '', /выросла на 19 624 ₽/);
  });

  it('без средних или при неизвестных ценах не выдумывает причину', () => {
    const unknown = structuredClone(sample);
    unknown.nominalTariffValue.end.unknownPrices = 2;
    assert.doesNotMatch(baseValueView(unknown).takeaway?.detail ?? '', /Каждый добавившийся/);
    unknown.nominalTariffValue.end.averageTariffRub = null;
    assert.equal(baseValueView(unknown).takeaway, null);
  });

  it('удержание: проверено N из M, границы и малая выборка', () => {
    const [d30, d60, d90] = sample.retention.map(retentionView);
    assert.equal(d30.checked, 'Проверено 123 из 150 человек');
    assert.match(d30.unknownNote ?? '', /59,3 %.*77,3 %/);
    assert.equal(d30.smallNote, null);
    assert.equal(d60.unknownNote, null);
    assert.equal(d90.rateText, '42,9 %');
    assert.match(d90.smallNote ?? '', /21 человек/);
  });

  it('удержание без доли — «пока рано», а не 0 %', () => {
    const none = retentionView({ days: 30, eligible: 0, evaluated: 0, retained: 0, unknown: 0, rate: null, lowerBound: null, upperBound: null });
    assert.equal(none.rateText, null);
    assert.match(none.emptyReason ?? '', /не дожил/);
    const blind = retentionView({ days: 60, eligible: 5, evaluated: 0, retained: 0, unknown: 5, rate: null, lowerBound: 0, upperBound: 100 });
    assert.match(blind.emptyReason ?? '', /перерыв/);
  });

  it('виды переходов: незнакомый вид читается как «Другое»', () => {
    assert.equal(transitionLabel('upgrade'), 'Повышение');
    assert.equal(transitionLabel('downgrade'), 'Понижение');
    assert.equal(transitionLabel('sideways'), 'Другое');
    assert.deepEqual(sortedTransitions([{ fromPlan: 'A', toPlan: 'B', kind: 'other', count: 1 }, { fromPlan: 'B', toPlan: 'A', kind: 'other', count: 5 }]).map(row => row.count), [5, 1]);
  });

  it('перерывы и моменты: UTC, часы с десятой', () => {
    assert.equal(formatMoment('2026-09-11T21:56:26.176017+00:00'), '11 сен, 21:56 UTC');
    assert.equal(formatMoment('2026-07-28T00:36:47.655977+00:00', true), '28 июл 2026, 00:36 UTC');
    assert.equal(formatMoment(null), '—');
    assert.equal(formatHours(96.5), '96,5 ч');
    assert.equal(formatHours(114), '114 ч');
  });

  it('подписи неполных недель называют и первую, и последнюю', () => {
    const notes = partialWeekNotes(sample.weekly);
    assert.equal(notes.length, 2);
    assert.match(notes[0], /^Неделя с 10 авг неполная: период начинается в середине недели/);
    assert.match(notes[1], /^Неделя с 9 ноя ещё не закончилась/);
    assert.deepEqual(partialWeekNotes(sample.weekly.map(week => ({ ...week, partial: false }))), []);
  });
});
