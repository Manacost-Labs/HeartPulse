import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const inventoryUrl = new URL('../config/runtime-service-inventory.json', import.meta.url);
const inventory = JSON.parse(readFileSync(inventoryUrl, 'utf8'));

const collectionNames = [
  'services',
  'routerGroups',
  'datasets',
  'schedules',
  'durableStateStores',
  'cacheStores',
];

const expectedDatasetGroups = [
  'traditional-standard-meta',
  'traditional-wild-meta',
  'traditional-matchups',
  'traditional-cards',
  'traditional-decks',
  'arena-classes',
  'arena-tier-list',
  'arena-legendaries',
  'arena-winning-decks',
  'battlegrounds-heroes',
  'battlegrounds-cards',
  'battlegrounds-compositions',
  'battlegrounds-trinkets',
];

const expectedSourceMembers = [
  'firestone_arena_cards_normal',
  'firestone_arena_cards_underground',
  'firestone_arena_legendaries_normal',
  'firestone_arena_legendaries_underground',
  'firestone_battlegrounds_cards',
  'firestone_battlegrounds_comps',
  'firestone_battlegrounds_spells',
  'heartharena_tierlist',
  'hearthstone_decks',
  'hsguru_matchups_diamond_4to1',
  'hsguru_matchups_legend',
  'hsguru_meta_standard_diamond_4to1',
  'hsguru_meta_standard_legend',
  'hsguru_meta_standard_top_5k',
  'hsguru_meta_standard_top_legend',
  'hsguru_meta_wild_diamond_4to1',
  'hsguru_meta_wild_legend',
  'hsguru_meta_wild_top_5k',
  'hsguru_meta_wild_top_legend',
  'hsguru_streamer_decks_legend_1000',
  'hsreplay_archetypes',
  'hsreplay_arena',
  'hsreplay_arena_cards_advanced',
  'hsreplay_arena_class_pages_firecrawl',
  'hsreplay_arena_legendaries',
  'hsreplay_arena_winning_decks',
  'hsreplay_battlegrounds_compositions',
  'hsreplay_battlegrounds_comps',
  'hsreplay_battlegrounds_hero_details',
  'hsreplay_battlegrounds_heroes',
  'hsreplay_battlegrounds_minions',
  'hsreplay_battlegrounds_trinkets_greater',
  'hsreplay_battlegrounds_trinkets_lesser',
  'hsreplay_cards_legend_1d',
  'hsreplay_cards_legend_included_popularity',
  'hsreplay_cards_legend_included_winrate',
  'hsreplay_cards_wild_legend_1d',
  'hsreplay_decks_trending',
  'hsreplay_meta_archetypes_legend_eu_1d',
  'hsreplay_meta_diamond_4to1_1d_firecrawl',
  'hsreplay_meta_legend_1d_firecrawl',
  'hsreplay_meta_top_1000_legend_1d_firecrawl',
  'metastats_decks',
  'metastats_matchups',
  'vicious_syndicate_live_beta',
  'vicious_syndicate_radars',
].sort();

const allowedCriticalities = new Set(['P0', 'P1', 'P2']);
const allowedHealthImpacts = new Set(['critical', 'degraded', 'isolated']);
const allowedReadinessImpacts = new Set(['blocks', 'degrades', 'none']);
const allowedBackupDecisions = new Set([
  'required',
  'rebuildable',
  'not-required',
  'offsite-replica',
  'separate-secret-store',
]);

function allItems() {
  return collectionNames.flatMap(collectionName => inventory[collectionName]);
}

test('runtime inventory has a stable versioned top-level contract', () => {
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(
    inventory.idPolicy,
    'IDs are globally unique across every inventory collection.',
  );

  for (const collectionName of collectionNames) {
    assert.ok(Array.isArray(inventory[collectionName]), `${collectionName} must be an array`);
    assert.ok(inventory[collectionName].length > 0, `${collectionName} must not be empty`);
  }

  assert.ok(Array.isArray(inventory.notes?.knownGaps));
  assert.ok(
    inventory.notes.knownGaps.some(note => /readiness/i.test(note)),
    'readiness integration gap must stay explicit until it is implemented',
  );
  assert.ok(
    inventory.notes.knownGaps.some(note => /off-host backup/i.test(note)),
    'data API off-host backup gap must stay explicit until it is implemented',
  );
});

test('every runtime item has ownership, impact and recovery decisions', () => {
  for (const item of allItems()) {
    assert.match(item.id, /^[a-z][a-z0-9-]+$/, `${item.id} must be a stable slug`);
    assert.equal(typeof item.name, 'string', `${item.id} must have a name`);
    assert.ok(item.name.trim(), `${item.id} name must not be empty`);
    assert.equal(typeof item.owner, 'string', `${item.id} must have an owner`);
    assert.ok(item.owner.trim(), `${item.id} owner must not be empty`);
    assert.ok(allowedCriticalities.has(item.criticality), `${item.id} has invalid criticality`);
    assert.match(item.source, /^(frontend|data-api):[^\s]+$/, `${item.id} has invalid source`);
    assert.ok(Array.isArray(item.consumers), `${item.id} consumers must be an array`);
    assert.ok(item.consumers.length > 0, `${item.id} must have at least one consumer`);
    assert.equal(
      new Set(item.consumers).size,
      item.consumers.length,
      `${item.id} consumers must be unique`,
    );
    assert.ok(
      allowedHealthImpacts.has(item.healthImpact),
      `${item.id} has invalid healthImpact`,
    );
    assert.ok(
      allowedReadinessImpacts.has(item.readinessImpact),
      `${item.id} has invalid readinessImpact`,
    );
    assert.ok(allowedBackupDecisions.has(item.backup), `${item.id} has invalid backup decision`);
    assert.match(item.runbook, /^(frontend|data-api):[^\s]+$/, `${item.id} has invalid runbook`);
  }
});

test('runtime IDs are globally unique by explicit policy', () => {
  const ids = allItems().map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, 'runtime IDs must be globally unique');
});

test('P0 items have explicit backup and readiness decisions', () => {
  const criticalItems = allItems().filter(item => item.criticality === 'P0');
  assert.ok(criticalItems.length > 0, 'inventory must classify critical items');

  for (const item of criticalItems) {
    assert.ok(allowedBackupDecisions.has(item.backup), `${item.id} backup is undecided`);
    assert.ok(allowedReadinessImpacts.has(item.readinessImpact), `${item.id} readiness is undecided`);
  }
});

test('parser-control coverage is exactly 13 groups and 46 unique sources', () => {
  assert.equal(inventory.datasets.length, 13);
  assert.deepEqual(
    inventory.datasets.map(dataset => dataset.registryId).sort(),
    [...expectedDatasetGroups].sort(),
  );

  for (const dataset of inventory.datasets) {
    assert.equal(dataset.source, 'data-api:app/parser_control_registry.py');
    assert.ok(Array.isArray(dataset.sourceMembers));
    assert.ok(dataset.sourceMembers.length > 0, `${dataset.registryId} must own a source`);
    assert.equal(
      new Set(dataset.sourceMembers).size,
      dataset.sourceMembers.length,
      `${dataset.registryId} source members must be unique`,
    );
  }

  const sourceMembers = inventory.datasets.flatMap(dataset => dataset.sourceMembers);
  assert.equal(sourceMembers.length, 46, 'registry must assign 46 source members');
  assert.equal(new Set(sourceMembers).size, 46, 'each source must belong to exactly one group');
  assert.deepEqual([...sourceMembers].sort(), expectedSourceMembers);
});

test('schedule entries keep their versioned trigger evidence', () => {
  for (const schedule of inventory.schedules) {
    assert.equal(typeof schedule.trigger, 'string', `${schedule.id} must record its trigger`);
    assert.ok(schedule.trigger.trim(), `${schedule.id} trigger must not be empty`);
    const systemdTimer = schedule.source.endsWith('.timer');
    const inProcessJob = schedule.source.startsWith('frontend:server/modules/')
      && schedule.source.includes('/jobs/');
    assert.ok(systemdTimer || inProcessJob, `${schedule.id} must have a versioned timer or job source`);
    if (inProcessJob) {
      assert.ok(String(schedule.lifecycle ?? '').trim(), `${schedule.id} must declare its process lifecycle`);
      assert.ok(String(schedule.idempotency ?? '').trim(), `${schedule.id} must declare idempotency or locking`);
    }
  }
});

test('subscription refresh schedule is owned by its module and bounded lifecycle', () => {
  const schedule = inventory.schedules.find(item => item.id === 'schedule-arena-subscription-refresh');
  assert.ok(schedule);
  assert.equal(schedule.owner, 'subscription-platform');
  assert.equal(schedule.trigger, 'node-cron */30 * * * * in the Arena web process');
  assert.match(schedule.lifecycle, /SIGINT or SIGTERM/);
  assert.match(schedule.idempotency, /no cross-instance distributed lock yet/);
});
