import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);

async function source(pathname) {
  return readFile(new URL(pathname, ROOT), 'utf8');
}

async function loadSharedRuntime({
  fetchImpl,
  tierData = [],
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
}) {
  const shared = await source('public/bg-legacy/shared.js');
  const runtimeWindow = {
    tierData,
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
  };
  const runtimeDocument = {
    readyState: 'loading',
    addEventListener() {},
  };

  vm.runInNewContext(shared, {
    window: runtimeWindow,
    document: runtimeDocument,
    fetch: fetchImpl,
    console: { warn() {} },
    URL,
    URLSearchParams,
    AbortController,
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
  });

  return runtimeWindow;
}

test('shared Battlegrounds runtime loads every page of the current trinket pool', async () => {
  const shared = await source('public/bg-legacy/shared.js');

  assert.match(shared, /\/api\/bg\/library\/extra\/trinket/);
  assert.match(shared, /in_pool:\s*"1"/);
  assert.match(shared, /pagination\?\.total_pages/);
  assert.match(shared, /window\.accessoriesData\s*=\s*current/);
  assert.match(shared, /return fallback/);
  assert.doesNotThrow(() => new Function(shared));
});

test('both active builders wait for synchronized live pools', async () => {
  const [strategy, tier] = await Promise.all([
    source('public/bg-legacy/strategy-builder.gridfix2.js'),
    source('public/bg-legacy/hero-tier-builder.js'),
  ]);

  for (const builder of [strategy, tier]) {
    assert.match(builder, /await window\.Shared\.loadCurrentAccessoriesData\(\)/);
    assert.match(builder, /window\.Shared\.loadCurrentHeroesData\(\)/);
    assert.match(builder, /englishNamesPayload, heroTiers\]\s*=\s*await Promise\.all/);
    assert.match(builder, /getHeroCards\(heroTiers\)/);
    assert.match(builder, /text:\s*stripHtml\(card\.text \|\| ""\)/);
    assert.doesNotThrow(() => new Function(builder));
  }
  assert.match(strategy, /src="\$\{window\.Shared\.escapeHtml\(card\.artUrl\)\}"/);
  assert.match(tier, /src="\$\{window\.Shared\.escapeHtml\(getCardArtUrl\(card, "256x"\)\)\}"/);
});

test('shared Battlegrounds runtime synchronizes current heroes with localized full-quality images', async () => {
  const requests = [];
  const apiPayload = {
    ok: true,
    view: {
      heroes: [
        {
          dbfId: 132608,
          hero: 'Повелитель кошмаров Ксавий',
          tier: 'S',
          pick_rate: '88.64%',
          avg_placement: '3.58',
          image: 'https://hearthstone.wiki.gg/images/BG36_HERO_105.png?f657db',
        },
        {
          dbfId: 132578,
          hero: "Трас'тат, паразит душ",
          tier: 'C',
          pick_rate: '74.02%',
          avg_placement: '4.37',
          image: 'https://hearthstone.wiki.gg/images/BG36_HERO_101.png?3002a1',
        },
      ],
    },
  };
  const libraryPayload = {
    data: [
      {
        dbf: 132608,
        card_id: 'BG36_HERO_105',
        name: { ru: 'Повелитель кошмаров Ксавий', en: 'Nightmare Lord Xavius' },
        images: { hero: 'https://hearthstone.wiki.gg/images/BG36_HERO_105.png?f657db' },
      },
      {
        dbf: 132578,
        card_id: 'BG36_HERO_101',
        name: { ru: "Трас'тат, паразит душ", en: "Tras'tath, Soul Parasite" },
        images: { hero: 'https://hearthstone.wiki.gg/images/BG36_HERO_101.png?3002a1' },
      },
    ],
  };
  const runtimeWindow = await loadSharedRuntime({
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (String(url).startsWith('/api/bg/heroes?')) {
        return { ok: true, json: async () => apiPayload };
      }
      if (String(url) === '/api/bg/library/extra/heroes?per_page=200') {
        return { ok: true, json: async () => libraryPayload };
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const tiers = JSON.parse(JSON.stringify(await runtimeWindow.Shared.loadCurrentHeroesData()));
  const heroes = tiers.flatMap(section => section.heroes);

  assert.deepEqual(tiers.map(section => section.tier), ['S', 'C']);
  assert.deepEqual(heroes.map(hero => hero.name), [
    'Повелитель кошмаров Ксавий',
    "Трас'тат, паразит душ",
  ]);
  assert.deepEqual(heroes.map(hero => hero.englishName), [
    'Nightmare Lord Xavius',
    "Tras'tath, Soul Parasite",
  ]);
  assert.deepEqual(heroes.map(hero => hero.cardId), ['BG36_HERO_105', 'BG36_HERO_101']);
  assert.equal(
    heroes[0].image,
    '/api/public-resource/wiki/images/BG36_HERO_105.png?f657db',
  );
  assert.equal(runtimeWindow.tierData.length, 2);
  assert.deepEqual(requests.map(request => request.url), [
    '/api/bg/heroes?mode=solo&mmr=TOP_50_PERCENT',
    '/api/bg/library/extra/heroes?per_page=200',
  ]);
  assert.ok(requests.every(request => request.options.credentials === 'same-origin'));
});

test('shared Battlegrounds runtime keeps bundled heroes when current stats are unavailable', async () => {
  const fallback = [{ tier: 'D', title: 'D Тир', heroes: [{ name: 'Резервный герой', image: '/fallback.png' }] }];
  const runtimeWindow = await loadSharedRuntime({
    tierData: fallback,
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });

  const result = await runtimeWindow.Shared.loadCurrentHeroesData();

  assert.equal(result, fallback);
  assert.equal(runtimeWindow.tierData, fallback);
});

test('shared Battlegrounds runtime times out stalled hero requests and returns bundled heroes', async () => {
  const fallback = [{ tier: 'D', title: 'D Тир', heroes: [{ name: 'Резервный герой', image: '/fallback.png' }] }];
  const runtimeWindow = await loadSharedRuntime({
    tierData: fallback,
    setTimeoutImpl: callback => {
      queueMicrotask(callback);
      return 1;
    },
    clearTimeoutImpl() {},
    fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });

  const result = await runtimeWindow.Shared.loadCurrentHeroesData();

  assert.equal(result, fallback);
  assert.equal(runtimeWindow.tierData, fallback);
});

test('shared Battlegrounds runtime rejects a suspiciously partial current hero pool', async () => {
  const fallback = [{
    tier: 'D',
    title: 'D Тир',
    heroes: Array.from({ length: 101 }, (_, index) => ({
      name: `Резервный герой ${index + 1}`,
      image: `/fallback-${index + 1}.png`,
    })),
  }];
  const runtimeWindow = await loadSharedRuntime({
    tierData: fallback,
    fetchImpl: async url => ({
      ok: true,
      json: async () => String(url).startsWith('/api/bg/heroes?')
        ? {
          ok: true,
          view: {
            heroes: Array.from({ length: 75 }, (_, index) => ({
              dbfId: index + 1,
              hero: `Текущий герой ${index + 1}`,
              tier: 'S',
              image: `/current-${index + 1}.png`,
            })),
          },
        }
        : { data: [] },
    }),
  });

  const result = await runtimeWindow.Shared.loadCurrentHeroesData();

  assert.equal(result, fallback);
  assert.equal(runtimeWindow.tierData, fallback);
});

test('Battlegrounds builder cache version changes with the live hero synchronization', async () => {
  const battlegrounds = await source('src/features/Battlegrounds.tsx');

  assert.match(battlegrounds, /BG_STRATEGY_BUILDER_VERSION = '20260811-live-heroes'/);
});
