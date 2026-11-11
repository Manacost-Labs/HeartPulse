import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { SubscriptionMetrics } from '../src/modules/subscriptionAnalytics/model/types.js';
import { createAdminResourceStore } from '../src/modules/adminWorkspace/model/adminResourceStore.js';
import {
  fetchSubscriptionMetrics,
  startLivePolling,
  SubscriptionMetricsError,
  subscriptionMetricsKey,
  SUBSCRIPTION_POLL_INTERVAL_MS,
  type LivePollingEnvironment,
} from '../src/modules/subscriptionAnalytics/public.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/boosty-subscription-metrics-sample-20261111.json', import.meta.url), 'utf8')) as SubscriptionMetrics;
const withPaid = (paidNow: number): SubscriptionMetrics => ({ ...sample, summary: { ...sample.summary, paidNow } });

/** Поддельное время и вкладка: интервалы срабатывают по `tick`, видимость переключает `show`/`hide`. */
function fakePage() {
  let now = 1_000_000;
  let nextId = 1;
  const timers = new Map<number, { every: number; due: number; callback: () => void }>();
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_type: string, listener: () => void) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
  };
  const environment: LivePollingEnvironment = {
    document: doc as unknown as LivePollingEnvironment['document'],
    setInterval: (callback, every) => { const id = nextId++; timers.set(id, { every, due: now + every, callback }); return id; },
    clearInterval: handle => { timers.delete(handle as number); },
  };
  const tick = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.values()].filter(timer => timer.due <= end).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      now = next.due;
      next.due += next.every;
      next.callback();
    }
    now = end;
  };
  const setVisibility = (state: DocumentVisibilityState) => { doc.visibilityState = state; listeners.forEach(listener => listener()); };
  return { environment, tick, now: () => now, timers, setVisibility, listeners };
}

type Reply = { status?: number; body?: unknown; hang?: Promise<void>; networkError?: boolean };
const realFetch = globalThis.fetch;
let requests: string[] = [];
let replies: Reply[] = [];

beforeEach(() => {
  requests = [];
  replies = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    const reply = replies.shift() ?? { body: sample };
    if (reply.networkError) throw new TypeError('Failed to fetch');
    if (reply.hang) await reply.hang;
    return new Response(JSON.stringify(reply.body ?? sample), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 5));

/** Повторяет то, что делает useLiveSubscriptionMetrics: ensure при монтировании и опрос поверх того же хранилища. */
async function mount(page: ReturnType<typeof fakePage>, days = 92) {
  const store = createAdminResourceStore(page.now);
  const key = subscriptionMetricsKey(days);
  const load = () => fetchSubscriptionMetrics(days);
  void store.ensure(key, load, 30_000);
  const stop = startLivePolling(() => { void store.refresh(key, load); }, SUBSCRIPTION_POLL_INTERVAL_MS, page.environment);
  await settle();
  return { read: () => store.read(key), stop };
}

describe('живое обновление', () => {
  it('опрашивает раз в 60 с и не сбрасывает показанные данные, пока грузится новый ответ', async () => {
    const page = fakePage();
    const live = await mount(page);
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], '/api/admin/boosty/subscription-metrics?days=92');
    assert.equal((live.read().data as SubscriptionMetrics).summary.paidNow, 414);

    page.tick(59_999);
    assert.equal(requests.length, 1);

    let release!: () => void;
    replies.push({ body: withPaid(420), hang: new Promise<void>(resolve => { release = resolve; }) });
    page.tick(1);
    await settle();
    assert.equal(requests.length, 2);
    const during = live.read();
    assert.equal(during.fetching, true);
    assert.equal((during.data as SubscriptionMetrics).summary.paidNow, 414, 'старые данные остаются на экране');
    release();
    await settle();
    assert.equal((live.read().data as SubscriptionMetrics).summary.paidNow, 420);
    assert.equal(live.read().fetching, false);
    live.stop();
  });

  it('на скрытой вкладке запросов нет, при возврате — запрос сразу и снова интервал', async () => {
    const page = fakePage();
    const live = await mount(page);
    page.setVisibility('hidden');
    assert.equal(page.timers.size, 0, 'интервал остановлен');
    page.tick(10 * 60_000);
    await settle();
    assert.equal(requests.length, 1);

    replies.push({ body: withPaid(430) });
    page.setVisibility('visible');
    await settle();
    assert.equal(requests.length, 2, 'при возврате запрос сразу');
    assert.equal((live.read().data as SubscriptionMetrics).summary.paidNow, 430);

    page.setVisibility('visible'); // повторное событие без перехода — без лишнего запроса
    await settle();
    assert.equal(requests.length, 2);
    page.tick(60_000);
    await settle();
    assert.equal(requests.length, 3);
    live.stop();
  });

  it('вкладка открыта скрытой — интервал не стартует до показа', async () => {
    const page = fakePage();
    page.setVisibility('hidden');
    const live = await mount(page);
    page.tick(5 * 60_000);
    assert.equal(requests.length, 1, 'только первичная загрузка ресурса');
    live.stop();
  });

  it('ошибка опроса не стирает данные, следующий успешный опрос снимает ошибку', async () => {
    const page = fakePage();
    const live = await mount(page);
    replies.push({ status: 502, body: { error: 'Не удалось загрузить аналитику подписок', source: 'unavailable' } });
    page.tick(60_000);
    await settle();
    const failed = live.read();
    assert.ok(failed.error instanceof SubscriptionMetricsError);
    assert.equal((failed.error as SubscriptionMetricsError).kind, 'unavailable');
    assert.equal((failed.data as SubscriptionMetrics).summary.paidNow, 414, 'прежние данные на месте');

    replies.push({ body: withPaid(425) });
    page.tick(60_000);
    await settle();
    assert.equal(live.read().error, null);
    assert.equal((live.read().data as SubscriptionMetrics).summary.paidNow, 425);
    live.stop();
  });

  it('источник ещё не выкачен: страница поднимается на следующем опросе без перезагрузки', async () => {
    const page = fakePage();
    replies.push({ status: 502, body: { error: 'x', source: 'unavailable' } });
    const live = await mount(page);
    assert.equal(live.read().data, undefined);
    assert.equal((live.read().error as SubscriptionMetricsError).kind, 'unavailable');
    page.tick(60_000);
    await settle();
    assert.equal(live.read().error, null);
    assert.equal((live.read().data as SubscriptionMetrics).summary.paidNow, 414);
    live.stop();
  });

  it('остановка снимает слушатель и интервал', async () => {
    const page = fakePage();
    const live = await mount(page);
    live.stop();
    assert.equal(page.timers.size, 0);
    assert.equal(page.listeners.size, 0);
    page.tick(5 * 60_000);
    assert.equal(requests.length, 1);
  });
});

describe('fetchSubscriptionMetrics: виды ошибок', () => {
  const kindOf = async () => {
    try {
      await fetchSubscriptionMetrics(92);
      return 'ok';
    } catch (error) {
      assert.ok(error instanceof SubscriptionMetricsError);
      return error.kind;
    }
  };

  it('403, 502 и сеть различимы', async () => {
    replies = [{ status: 403, body: { error: 'Недостаточно прав' } }];
    assert.equal(await kindOf(), 'forbidden');
    replies = [{ status: 502, body: { error: 'x', source: 'unavailable' } }];
    assert.equal(await kindOf(), 'unavailable');
    replies = [{ networkError: true }];
    assert.equal(await kindOf(), 'network');
    replies = [{ status: 500, body: {} }];
    assert.equal(await kindOf(), 'network');
    replies = [{ body: { unexpected: true } }];
    assert.equal(await kindOf(), 'network');
  });

  it('несовместимость источника доходит до интерфейса', async () => {
    replies = [{ status: 502, body: { error: 'x', source: 'unavailable', reason: 'incompatible' } }];
    await assert.rejects(fetchSubscriptionMetrics(92), (error: unknown) => error instanceof SubscriptionMetricsError && error.incompatible);
  });
});
