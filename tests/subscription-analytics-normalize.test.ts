import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import {
  normalizeSubscriptionMetrics,
  SubscriptionMetricsSourceError,
} from '../server/modules/subscriptionAnalytics/public.js';
import { propertyRuns } from './helpers/propertyRuns.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/boosty-subscription-metrics-sample-20261111.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const clone = <T>(value: T): T => structuredClone(value);

type Path = Array<string | number>;
/** Пути ко всем объектам и ко всем числовым/строковым листьям образца. */
function walk(value: unknown, path: Path, objects: Path[], leaves: Path[]): void {
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, [...path, index], objects, leaves));
  else if (value && typeof value === 'object') {
    objects.push(path);
    for (const [key, item] of Object.entries(value)) walk(item, [...path, key], objects, leaves);
  } else if (value !== null) leaves.push(path);
}
const objects: Path[] = [];
const allLeaves: Path[] = [];
walk(sample, [], objects, allLeaves);
// Ключи карты тарифов в daily[].plans необязательны по самой природе карты: их пропажа — не ошибка.
// Карта тарифов принимает любые ключи с числами, поэтому лишний ключ в ней — это ещё один тариф, а не «лишнее поле».
const objectPaths = objects.filter(path => !(path[0] === 'daily' && path[2] === 'plans'));
const leaves = allLeaves.filter(path => !(path[0] === 'daily' && path[2] === 'plans'));

function at(root: unknown, path: Path): Record<string, unknown> {
  return path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], root) as Record<string, unknown>;
}

describe('normalizeSubscriptionMetrics', () => {
  it('образец проходит без изменений', () => {
    assert.deepEqual(normalizeSubscriptionMetrics(clone(sample)), sample);
  });

  it('property: лишние поля на любом объекте отбрасываются, остальное не меняется', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...objectPaths.map((_, index) => index)), fc.string({ minLength: 1, maxLength: 12 }), fc.jsonValue()), { minLength: 1, maxLength: 6 }),
        extras => {
          const polluted = clone(sample);
          for (const [objectIndex, key, value] of extras) {
            const target = at(polluted, objectPaths[objectIndex]!);
            if (!(key in target)) Object.defineProperty(target, `x_${key}`, { value, enumerable: true, configurable: true, writable: true });
          }
          assert.deepEqual(normalizeSubscriptionMetrics(polluted), sample);
        },
      ),
      propertyRuns,
    );
  });

  it('property: поле другого типа (или пропавшее) не проходит', () => {
    const wrong = fc.constantFrom<unknown>('текст', {}, [], true, Number.NaN, null, undefined);
    fc.assert(
      fc.property(fc.constantFrom(...leaves.map((_, index) => index)), wrong, (leafIndex, replacement) => {
        const path = leaves[leafIndex]!;
        const broken = clone(sample);
        const parent = at(broken, path.slice(0, -1));
        const key = path[path.length - 1]!;
        const original = (parent as Record<string | number, unknown>)[key];
        if (typeof key === 'number' && replacement === undefined) return; // дыра в массиве — не JSON
        if (typeof original === typeof replacement && !Number.isNaN(replacement)) return; // тот же тип — не ошибка типа
        if (replacement === undefined) delete (parent as Record<string | number, unknown>)[key];
        else (parent as Record<string | number, unknown>)[key] = replacement;
        // Допустимые null: поля, которые источник вправе отдать пустыми, в образце заполнены.
        if (replacement === null && NULLABLE.has(String(key))) return;
        assert.throws(() => normalizeSubscriptionMetrics(broken), SubscriptionMetricsSourceError);
      }),
      propertyRuns,
    );
  });

  it('__proto__ в картах тарифов не меняет прототип', () => {
    const polluted = clone(sample) as { daily: Array<{ plans: Record<string, number> }> };
    polluted.daily[0]!.plans = JSON.parse('{"__proto__": 5, "Алмаз": 1}');
    const result = normalizeSubscriptionMetrics(polluted);
    const plans = result.daily[0]!.plans;
    assert.equal(Object.getPrototypeOf(plans), Object.prototype);
    assert.deepEqual(Object.keys(plans).sort(), ['__proto__', 'Алмаз']);
    assert.equal(({} as { polluted?: unknown }).polluted, undefined);
  });

  it('null допустим там, где источник вправе его отдать', () => {
    const empty = clone(sample) as Record<string, any>;
    empty.coverage.lastAcceptedPollAt = null;
    empty.coverage.maxPollGapSeconds = null;
    empty.retention[0].rate = null;
    empty.months[0].churnRate = null;
    empty.plans[0].priceRub = null;
    empty.nominalTariffValue.end.averageTariffRub = null;
    empty.moneyEstimate.estimatedArppuRub = null;
    const result = normalizeSubscriptionMetrics(empty);
    assert.equal(result.coverage.lastAcceptedPollAt, null);
    assert.equal(result.retention[0]!.rate, null);
  });

  it('несовместимость версии и семантики помечается incompatible', () => {
    for (const patch of [{ schemaVersion: 2 }, { schemaVersion: '1' }, { semantics: 'other' }]) {
      assert.throws(
        () => normalizeSubscriptionMetrics({ ...sample, ...patch }),
        (error: unknown) => error instanceof SubscriptionMetricsSourceError && error.incompatible,
      );
    }
    assert.throws(
      () => normalizeSubscriptionMetrics({ ...sample, summary: null }),
      (error: unknown) => error instanceof SubscriptionMetricsSourceError && !error.incompatible,
    );
  });

  it('слишком длинные списки отвергаются', () => {
    const big = { ...sample, daily: Array.from({ length: 5000 }, () => (sample.daily as unknown[])[0]) };
    assert.throws(() => normalizeSubscriptionMetrics(big), SubscriptionMetricsSourceError);
  });
});

const NULLABLE = new Set(['lastAcceptedPollAt', 'baselineAt', 'maxPollGapSeconds', 'priceRub', 'averageTariffRub', 'rate', 'lowerBound', 'upperBound', 'churnRate', 'estimatedArppuRub']);
