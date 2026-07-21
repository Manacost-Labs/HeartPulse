import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConstructedCardCatalogCandidateError,
  ConstructedCardCatalogStore,
} from '../server/constructedCardCatalogStore.js';
import { writeJsonAtomically } from '../server/durableJson.js';

const directory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-catalog-'));
let now = Date.parse('2026-07-21T08:00:00.000Z');
const clock = () => now;
const card = (index: number) => ({
  card_id: `CARD_${index}`,
  dbf: index,
  name: { ru: `Карта ${index}`, en: `Card ${index}` },
  card_set: 'CORE',
  images: { card: `https://cdn.example.test/CARD_${index}.png` },
});
const cards = Array.from({ length: 10 }, (_, index) => card(index + 1));
const rawCardsWithPrivateSentinels = cards.map((item, index) => index === 0 ? {
  ...item,
  stats: { privateSentinel: 'QA_PRIVATE_STATS' },
  decks: [{ deckCode: 'QA_PRIVATE_DECK_CODE' }],
  entitlement: { user: 'QA_PRIVATE_USER' },
  subscription: 'QA_PRIVATE_SUBSCRIPTION',
  wiki: { public_note: 'kept', token_metadata: { type: 'generated-card', name: 'TOKEN_1' } },
} : item);

try {
  const store = new ConstructedCardCatalogStore({
    stateDirectory: directory,
    now: clock,
    maxStaleMs: 48 * 60 * 60_000,
    minimumCardCountByFormat: { standard: 1, wild: 1 },
  });

  const standard = store.publish('standard', [...rawCardsWithPrivateSentinels].reverse(), {
    expectedTotal: cards.length,
    sourceUpdatedAt: '2026-07-21T07:55:00.000Z',
  });
  assert.equal(standard.schemaVersion, 1);
  assert.equal(standard.format, 'standard');
  assert.match(standard.datasetVersion, /^ccc1-sha256:[a-f0-9]{64}$/);
  assert.equal(standard.count, cards.length);
  assert.deepEqual(standard.cards.map(item => item.card_id), cards.map(item => item.card_id),
    'the persisted raw catalog must have deterministic canonical ordering');
  assert.equal(standard.verifiedAt, '2026-07-21T08:00:00.000Z');
  assert.equal(standard.publishedAt, '2026-07-21T08:00:00.000Z');
  const persistedRaw = JSON.stringify(standard.cards);
  assert.doesNotMatch(persistedRaw, /QA_PRIVATE|deckCode|entitlement|subscription|"stats"/i,
    'the durable raw catalog must never persist stats, deck or entitlement payloads');
  assert.equal(standard.cards[0].wiki.public_note, 'kept');
  assert.deepEqual(standard.cards[0].wiki.token_metadata, { name: 'TOKEN_1', type: 'generated-card' },
    'legitimate token-card metadata must survive the raw catalog projection');

  now += 60_000;
  const unchanged = store.publish('standard', rawCardsWithPrivateSentinels, { expectedTotal: cards.length });
  assert.equal(unchanged.datasetVersion, standard.datasetVersion);
  assert.equal(unchanged.publishedAt, standard.publishedAt,
    'verifying an unchanged catalog must not invent a new publication time');
  assert.equal(unchanged.verifiedAt, '2026-07-21T08:01:00.000Z');

  const wild = store.publish('wild', [card(101), card(102)], { expectedTotal: 2 });
  assert.equal(wild.format, 'wild');
  assert.notEqual(wild.datasetVersion, standard.datasetVersion);
  assert.equal(store.readUsable('standard')?.document.count, 10);
  assert.equal(store.readUsable('wild')?.document.count, 2);

  const restarted = new ConstructedCardCatalogStore({
    stateDirectory: directory,
    now: clock,
    minimumCardCountByFormat: { standard: 1, wild: 1 },
  });
  assert.equal(restarted.readUsable('standard')?.document.datasetVersion, standard.datasetVersion,
    'a process restart must recover the durable LKG');
  assert.equal(restarted.inspect('standard').state, 'fresh',
    'a just-verified LKG remains fresh throughout the explicit memory TTL window');

  const beforeRejected = restarted.readUsable('standard')?.document.datasetVersion;
  assert.throws(
    () => restarted.publish('standard', [cards[0], { ...cards[1], card_id: cards[0].card_id }], { expectedTotal: 2 }),
    ConstructedCardCatalogCandidateError,
  );
  assert.throws(
    () => restarted.publish('standard', [cards[0], { ...cards[1], dbf: cards[0].dbf }], { expectedTotal: 2 }),
    /duplicate DBF/i,
  );
  assert.throws(
    () => restarted.publish('standard', [{ ...cards[0], card_id: '' }], { expectedTotal: 1 }),
    /identity/i,
  );
  assert.throws(
    () => restarted.publish('standard', cards.slice(0, 6), { expectedTotal: 6 }),
    /collapse/i,
    'a candidate below 70% of the prior LKG must not replace it',
  );
  assert.equal(restarted.readUsable('standard')?.document.datasetVersion, beforeRejected);

  const primary = join(directory, 'constructed-card-catalog-v1', 'standard.json');
  const recovery = join(directory, 'constructed-card-catalog-v1', 'standard.lkg.json');
  const validDocument = JSON.parse(readFileSync(primary, 'utf8'));

  const hashTampered = structuredClone(validDocument);
  hashTampered.cards[0].name.ru = 'Подмена';
  writeFileSync(primary, `${JSON.stringify(hashTampered)}\n`, 'utf8');
  assert.equal(new ConstructedCardCatalogStore({ stateDirectory: directory, now: clock, minimumCardCountByFormat: { standard: 1 } }).readUsable('standard')?.document.datasetVersion, beforeRejected,
    'a hash-invalid primary must fall back to the checksum-valid mirror');
  assert.equal(readFileSync(primary, 'utf8'), readFileSync(recovery, 'utf8'),
    'serving the mirror must self-heal a corrupt primary without changing metadata');

  unlinkSync(primary);
  const crashRecovery = new ConstructedCardCatalogStore({
    stateDirectory: directory,
    now: clock,
    minimumCardCountByFormat: { standard: 1, wild: 1 },
  }).readUsable('standard');
  assert.equal(crashRecovery?.document.datasetVersion, beforeRejected);
  assert.equal(existsSync(primary), true, 'a crash after the recovery rename must recreate the missing primary');
  assert.equal(readFileSync(primary, 'utf8'), readFileSync(recovery, 'utf8'));

  const formatTampered = structuredClone(validDocument);
  formatTampered.format = 'wild';
  writeFileSync(primary, `${JSON.stringify(formatTampered)}\n`, 'utf8');
  assert.equal(new ConstructedCardCatalogStore({ stateDirectory: directory, now: clock, minimumCardCountByFormat: { standard: 1 } }).readUsable('standard')?.document.datasetVersion, beforeRejected,
    'a cross-format document must never be served');

  const futureTampered = structuredClone(validDocument);
  futureTampered.verifiedAt = '2026-07-22T08:00:00.000Z';
  writeFileSync(primary, `${JSON.stringify(futureTampered)}\n`, 'utf8');
  writeFileSync(recovery, `${JSON.stringify(futureTampered)}\n`, 'utf8');
  assert.equal(new ConstructedCardCatalogStore({ stateDirectory: directory, now: clock, minimumCardCountByFormat: { standard: 1 } }).readUsable('standard'), null,
    'future-dated LKG files must fail closed');

  writeFileSync(primary, `${JSON.stringify(validDocument)}\n`, 'utf8');
  writeFileSync(recovery, `${JSON.stringify(validDocument)}\n`, 'utf8');
  now = Date.parse(validDocument.verifiedAt) + 48 * 60 * 60_000 + 1;
  const expired = new ConstructedCardCatalogStore({
    stateDirectory: directory,
    now: clock,
    maxStaleMs: 48 * 60 * 60_000,
    minimumCardCountByFormat: { standard: 1 },
  });
  assert.equal(expired.readUsable('standard'), null, 'an LKG older than 48 hours must not be served');
  assert.equal(expired.inspect('standard').state, 'expired', 'health must distinguish expired data from missing data');
} finally {
  rmSync(directory, { recursive: true, force: true });
}

const coldFloorDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-floor-'));
try {
  const productionFloor = new ConstructedCardCatalogStore({
    stateDirectory: coldFloorDirectory,
    now: () => Date.parse('2026-07-21T08:00:00.000Z'),
  });
  assert.throws(
    () => productionFloor.publish('standard', [card(1)], { expectedTotal: 1 }),
    /implausibly small/i,
    'a lying one-card total must not seed a cold production LKG',
  );
  assert.equal(productionFloor.readUsable('standard'), null);
} finally {
  rmSync(coldFloorDirectory, { recursive: true, force: true });
}

const repairFaultDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-repair-fault-'));
try {
  const seed = new ConstructedCardCatalogStore({
    stateDirectory: repairFaultDirectory,
    now: () => Date.parse('2026-07-21T08:00:00.000Z'),
    minimumCardCountByFormat: { standard: 1 },
  });
  const seeded = seed.publish('standard', cards, { expectedTotal: cards.length });
  const primary = join(repairFaultDirectory, 'constructed-card-catalog-v1', 'standard.json');
  unlinkSync(primary);

  const repairFault = new ConstructedCardCatalogStore({
    stateDirectory: repairFaultDirectory,
    now: () => Date.parse('2026-07-21T08:01:00.000Z'),
    minimumCardCountByFormat: { standard: 1 },
    writeJson: (dataDirectory, filename, document, mode) => {
      if (filename === 'standard.json') throw Object.assign(new Error('repair denied'), { code: 'EACCES' });
      return writeJsonAtomically(dataDirectory, filename, document, mode);
    },
  });
  const usableDespiteRepairFailure = repairFault.readUsable('standard');
  assert.equal(usableDespiteRepairFailure?.document.datasetVersion, seeded.datasetVersion,
    'a valid recovery mirror must remain serviceable when best-effort primary repair fails');
  assert.match(usableDespiteRepairFailure?.repairWarning || '', /redundancy/i);
  assert.equal(repairFault.inspect('standard').state, 'stale',
    'a failed mirror repair must degrade health even while the LKG remains usable');
  assert.match(repairFault.inspect('standard').repairWarning || '', /redundancy/i);
} finally {
  rmSync(repairFaultDirectory, { recursive: true, force: true });
}

const partialPublishDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-partial-publish-'));
try {
  let publishNow = Date.parse('2026-07-21T08:00:00.000Z');
  const seed = new ConstructedCardCatalogStore({
    stateDirectory: partialPublishDirectory,
    now: () => publishNow,
    minimumCardCountByFormat: { standard: 1 },
  });
  const versionA = seed.publish('standard', cards, { expectedTotal: cards.length });
  const expandedCards = [...cards, card(11)];
  publishNow += 60_000;

  const primaryFailure = new ConstructedCardCatalogStore({
    stateDirectory: partialPublishDirectory,
    now: () => publishNow,
    minimumCardCountByFormat: { standard: 1 },
    writeJson: (dataDirectory, filename, document, mode) => {
      if (filename === 'standard.json') throw Object.assign(new Error('primary disk full'), { code: 'ENOSPC' });
      return writeJsonAtomically(dataDirectory, filename, document, mode);
    },
  });
  assert.throws(() => primaryFailure.publish('standard', expandedCards, { expectedTotal: expandedCards.length }), /primary disk full/);
  assert.equal(primaryFailure.readUsable('standard')?.document.datasetVersion, versionA.datasetVersion,
    'a failed authoritative primary commit must leave version A selectable and must not expose version B from the mirror');

  const mirrorFailure = new ConstructedCardCatalogStore({
    stateDirectory: partialPublishDirectory,
    now: () => publishNow,
    minimumCardCountByFormat: { standard: 1 },
    writeJson: (dataDirectory, filename, document, mode) => {
      if (filename === 'standard.lkg.json') throw Object.assign(new Error('mirror disk full'), { code: 'ENOSPC' });
      return writeJsonAtomically(dataDirectory, filename, document, mode);
    },
  });
  const committedB = mirrorFailure.publish('standard', expandedCards, { expectedTotal: expandedCards.length });
  assert.equal(mirrorFailure.readUsable('standard')?.document.datasetVersion, committedB.datasetVersion,
    'a successful authoritative primary commit remains selectable when the recovery mirror write fails');
  assert.equal(mirrorFailure.inspect('standard').state, 'stale');
  assert.match(mirrorFailure.inspect('standard').repairWarning || '', /redundancy/i,
    'a primary-only commit must be explicit instead of reporting a healthy fresh publication');
} finally {
  rmSync(partialPublishDirectory, { recursive: true, force: true });
}

const updateGateDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-update-gates-'));
try {
  const updateGate = new ConstructedCardCatalogStore({
    stateDirectory: updateGateDirectory,
    now: () => Date.parse('2026-07-21T08:00:00.000Z'),
    minimumCardCountByFormat: { standard: 1 },
  });
  updateGate.publish('standard', cards, { expectedTotal: cards.length });
  const legitimateRotation = [
    ...cards.slice(0, 6),
    ...Array.from({ length: 4 }, (_, index) => card(300 + index)),
  ];
  assert.doesNotThrow(
    () => updateGate.publish('standard', legitimateRotation, { expectedTotal: legitimateRotation.length }),
    'a legitimate release replacing 40% of the smaller membership set must pass the warm overlap gate',
  );
  const disjoint = Array.from({ length: cards.length }, (_, index) => card(100 + index));
  assert.throws(
    () => updateGate.publish('standard', disjoint, { expectedTotal: disjoint.length }),
    /overlap/i,
    'a same-size disjoint Standard/Wild-style swap must never replace the warm LKG',
  );
  const implausibleGrowth = [...cards, ...Array.from({ length: 11 }, (_, index) => card(200 + index))];
  assert.throws(
    () => updateGate.publish('standard', implausibleGrowth, { expectedTotal: implausibleGrowth.length }),
    /growth/i,
  );
  const controlled = updateGate.publish('standard', implausibleGrowth, {
    expectedTotal: implausibleGrowth.length,
    controlledExpansion: true,
  });
  assert.equal(controlled.count, implausibleGrowth.length,
    'an explicit controlled expansion may exceed the normal growth ceiling when prior membership is preserved');
} finally {
  rmSync(updateGateDirectory, { recursive: true, force: true });
}

const postRenameDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-post-rename-'));
try {
  let postRenameNow = Date.parse('2026-07-21T08:00:00.000Z');
  const seed = new ConstructedCardCatalogStore({
    stateDirectory: postRenameDirectory,
    now: () => postRenameNow,
    minimumCardCountByFormat: { standard: 1 },
  });
  seed.publish('standard', cards, { expectedTotal: cards.length });
  postRenameNow += 60_000;
  const expanded = [...cards, card(11)];
  const primaryPostRenameError = new ConstructedCardCatalogStore({
    stateDirectory: postRenameDirectory,
    now: () => postRenameNow,
    minimumCardCountByFormat: { standard: 1 },
    writeJson: (dataDirectory, filename, document, mode) => {
      const result = writeJsonAtomically(dataDirectory, filename, document, mode);
      if (filename === 'standard.json') throw new Error('directory fsync failed after primary rename');
      return result;
    },
  });
  const committed = primaryPostRenameError.publish('standard', expanded, { expectedTotal: expanded.length });
  assert.equal(primaryPostRenameError.readUsable('standard')?.document.datasetVersion, committed.datasetVersion,
    'a writer error after the primary rename must be classified by the readable commit, not reported as an uncommitted lie');

  postRenameNow += 60_000;
  const mirrorPostRenameError = new ConstructedCardCatalogStore({
    stateDirectory: postRenameDirectory,
    now: () => postRenameNow,
    minimumCardCountByFormat: { standard: 1 },
    writeJson: (dataDirectory, filename, document, mode) => {
      const result = writeJsonAtomically(dataDirectory, filename, document, mode);
      if (filename === 'standard.lkg.json') throw new Error('directory fsync failed after mirror rename');
      return result;
    },
  });
  const expandedAgain = [...expanded, card(12)];
  mirrorPostRenameError.publish('standard', expandedAgain, { expectedTotal: expandedAgain.length });
  assert.equal(mirrorPostRenameError.inspect('standard').state, 'stale',
    'a mirror writer error remains degraded until a later fully successful publication or repair');
  assert.match(mirrorPostRenameError.inspect('standard').repairWarning || '', /redundancy/i);
  const restartedWithMarker = new ConstructedCardCatalogStore({
    stateDirectory: postRenameDirectory,
    now: () => postRenameNow,
    minimumCardCountByFormat: { standard: 1 },
  });
  assert.equal(restartedWithMarker.inspect('standard').state, 'stale',
    'the durable degraded marker must survive a process restart even when both renamed copies are readable');
  assert.match(restartedWithMarker.inspect('standard').repairWarning || '', /redundancy/i);
  assert.equal(restartedWithMarker.readUsable('standard')?.document.count, expandedAgain.length);
  assert.equal(restartedWithMarker.inspect('standard').state, 'fresh',
    'a successful startup verification/repair must durably clear the degraded marker');
} finally {
  rmSync(postRenameDirectory, { recursive: true, force: true });
}

const markerBoundaryDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-marker-boundaries-'));
try {
  let markerNow = Date.parse('2026-07-21T08:00:00.000Z');
  const seed = new ConstructedCardCatalogStore({
    stateDirectory: markerBoundaryDirectory,
    now: () => markerNow,
    minimumCardCountByFormat: { standard: 1 },
  });
  const versionA = seed.publish('standard', cards, { expectedTotal: cards.length });
  markerNow += 60_000;
  const versionB = [...cards, card(11)];
  const markerWriteFailure = new ConstructedCardCatalogStore({
    stateDirectory: markerBoundaryDirectory,
    now: () => markerNow,
    minimumCardCountByFormat: { standard: 1 },
    writeJson: (dataDirectory, filename, document, mode) => {
      if (filename.endsWith('.degraded.json')) throw new Error('marker unavailable');
      return writeJsonAtomically(dataDirectory, filename, document, mode);
    },
  });
  assert.throws(() => markerWriteFailure.publish('standard', versionB, { expectedTotal: versionB.length }), /marker unavailable/);
  assert.equal(markerWriteFailure.readUsable('standard')?.document.datasetVersion, versionA.datasetVersion,
    'marker creation failure must abort before the authoritative primary changes');

  const markerClearFailure = new ConstructedCardCatalogStore({
    stateDirectory: markerBoundaryDirectory,
    now: () => markerNow,
    minimumCardCountByFormat: { standard: 1 },
    removeFileDurably: () => { throw new Error('marker clear fsync failed'); },
  });
  const committedB = markerClearFailure.publish('standard', versionB, { expectedTotal: versionB.length });
  assert.equal(markerClearFailure.readUsable('standard')?.document.datasetVersion, committedB.datasetVersion);
  const restartedAfterClearFailure = new ConstructedCardCatalogStore({
    stateDirectory: markerBoundaryDirectory,
    now: () => markerNow,
    minimumCardCountByFormat: { standard: 1 },
  });
  assert.equal(restartedAfterClearFailure.inspect('standard').state, 'stale',
    'marker clear failure must remain durable and degraded after restart');
  restartedAfterClearFailure.readUsable('standard');
  assert.equal(restartedAfterClearFailure.inspect('standard').state, 'fresh');
} finally {
  rmSync(markerBoundaryDirectory, { recursive: true, force: true });
}

const formatEvidenceDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-format-evidence-'));
try {
  const formatEvidence = new ConstructedCardCatalogStore({
    stateDirectory: formatEvidenceDirectory,
    now: () => Date.parse('2026-07-21T08:00:00.000Z'),
    minimumCardCountByFormat: { standard: 1, wild: 1 },
  });
  assert.throws(
    () => formatEvidence.publish('standard', cards.map(item => ({ ...item, formats: ['wild'] })), {
      expectedTotal: cards.length,
    }),
    /format evidence/i,
    'cold Standard publication must reject explicit card membership evidence that only names Wild',
  );
  const explicitWild = formatEvidence.publish('wild', [
    { ...card(201), formats: [{ slug: 'wild', name_en: 'Wild' }] },
    { ...card(202), formats: [{ id: 1, name: 'Wild' }] },
  ], { expectedTotal: 2 });
  assert.equal(explicitWild.count, 2,
    'real upstream object format evidence must satisfy the cold Wild gate');
} finally {
  rmSync(formatEvidenceDirectory, { recursive: true, force: true });
}

const coldWildAmbiguityDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-cold-wild-ambiguity-'));
try {
  const productionWild = new ConstructedCardCatalogStore({
    stateDirectory: coldWildAmbiguityDirectory,
    now: () => Date.parse('2026-07-21T08:00:00.000Z'),
  });
  const standardSized = Array.from({ length: 1_152 }, (_, index) => ({
    ...card(10_000 + index),
    formats: [{ slug: 'standard', name_en: 'Standard' }],
  }));
  assert.throws(
    () => productionWild.publish('wild', standardSized, { expectedTotal: standardSized.length }),
    /format evidence|ambiguous Wild/i,
    'a cold Standard-sized subset must not seed the Wild LKG without authoritative Wild evidence',
  );
  const dualFormatStandardSized = Array.from({ length: 1_152 }, (_, index) => ({
    ...card(40_000 + index),
    formats: [
      { slug: 'standard', name_en: 'Standard' },
      { slug: 'wild', name_en: 'Wild' },
    ],
  }));
  assert.throws(
    () => productionWild.publish('wild', dualFormatStandardSized, { expectedTotal: dualFormatStandardSized.length }),
    /ambiguous Wild/i,
    'dual Standard/Wild membership on 1,152 real-like cards is not proof of a complete cold Wild catalog',
  );
  const ambiguousStandardSized = Array.from({ length: 1_152 }, (_, index) => card(30_000 + index));
  assert.throws(
    () => productionWild.publish('wild', ambiguousStandardSized, { expectedTotal: ambiguousStandardSized.length }),
    /ambiguous Wild/i,
    'a cold Wild snapshot with no format envelope must not accept a plausible Standard-sized subset',
  );
  const realScaleAmbiguousWild = Array.from({ length: 3_000 }, (_, index) => card(20_000 + index));
  assert.doesNotThrow(
    () => productionWild.publish('wild', realScaleAmbiguousWild, { expectedTotal: realScaleAmbiguousWild.length }),
    'a conservative real-scale Wild snapshot may seed cold storage when optional format evidence is absent',
  );

  const realLikeFullWildDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-full-wild-'));
  try {
    const realLikeFullWildStore = new ConstructedCardCatalogStore({
      stateDirectory: realLikeFullWildDirectory,
      now: () => Date.parse('2026-07-21T08:00:00.000Z'),
    });
    const realLikeFullWild = Array.from({ length: 6_331 }, (_, index) => ({
      ...card(50_000 + index),
      formats: [{ slug: 'wild', name_en: 'Wild' }],
    }));
    assert.doesNotThrow(
      () => realLikeFullWildStore.publish('wild', realLikeFullWild, { expectedTotal: realLikeFullWild.length }),
      'a real-scale 6,331-card Wild catalog must be accepted on cold start',
    );
  } finally {
    rmSync(realLikeFullWildDirectory, { recursive: true, force: true });
  }
} finally {
  rmSync(coldWildAmbiguityDirectory, { recursive: true, force: true });
}

console.log('constructed-card catalog durable LKG store contracts passed');
