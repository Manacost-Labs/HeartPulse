import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { ANALYTICS_LOADER } from '../apps/public-web/lib/analyticsLoader';

type FakeScript = { dataset: Record<string, string>; src: string };

function runLoader(hostname: string, prerendering: boolean) {
  const scripts: FakeScript[] = [];
  const listeners: Array<{ type: string; listener: () => void; options: unknown }> = [];
  const document = {
    prerendering,
    createElement: (): FakeScript => ({ dataset: {}, src: '' }),
    head: { appendChild: (script: FakeScript) => { scripts.push(script); } },
    addEventListener: (type: string, listener: () => void, options: unknown) => { listeners.push({ type, listener, options }); },
  };
  const context = { location: { hostname }, document };
  vm.runInNewContext(ANALYTICS_LOADER, context);
  return { scripts, listeners, globals: Object.keys(context) };
}

test('the canonical host loads Plausible once for a visible document', () => {
  const { scripts, listeners, globals } = runLoader('hearthpulse.net', false);
  assert.deepEqual(scripts, [{ dataset: { domain: 'hearthpulse.net' }, src: 'https://stats.hs-manacost.ru/js/script.js' }]);
  assert.deepEqual(listeners, []);
  assert.deepEqual(globals, ['location', 'document'], 'the loader must not leak globals');
});

test('a prerendered document counts its pageview only after the visitor opens it', () => {
  const { scripts, listeners } = runLoader('hearthpulse.net', true);
  assert.deepEqual(scripts, [], 'a page that may never be visited must not reach the statistics');
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'prerenderingchange');
  assert.equal((listeners[0].options as { once?: boolean }).once, true);

  listeners[0].listener();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://stats.hs-manacost.ru/js/script.js');
});

test('other hosts never load analytics', () => {
  for (const prerendering of [false, true]) {
    const { scripts, listeners } = runLoader('127.0.0.1', prerendering);
    assert.deepEqual(scripts, []);
    assert.deepEqual(listeners, []);
  }
});
