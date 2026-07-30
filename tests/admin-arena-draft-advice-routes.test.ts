import assert from 'node:assert/strict';
import express from 'express';
import { createAdminArenaSynergyRouter } from '../server/adminArenaSynergyRoutes.js';
import type { ArenaSynergyPayload } from '../shared/arenaSynergyContract.js';

function analysisPayload(options: {
  selectedClass?: 'MAGE' | 'HUNTER';
  advisorReady?: boolean;
} = {}): ArenaSynergyPayload {
  const selectedClass = options.selectedClass ?? 'MAGE';
  const cards = [
    { id: 'A', name: 'Альфа', cost: 2, type: 'MINION', rarity: 'COMMON', deckWinRate: 58, twelveWinRunQuality: 90, runs: 40 },
    { id: 'B', name: 'Бета', cost: 3, type: 'MINION', rarity: 'COMMON', deckWinRate: 57, twelveWinRunQuality: 89, runs: 35 },
    { id: 'C', name: 'Гамма', cost: 7, type: 'MINION', rarity: 'RARE', deckWinRate: 56, twelveWinRunQuality: 88, runs: 30 },
  ];
  return {
    schemaVersion: 2,
    generatedAt: '2026-07-30T10:00:00.000Z',
    selectedClass,
    source: {
      winningDecksFetchedAt: '2026-07-30T09:55:00.000Z',
      cardStatsFetchedAt: '2026-07-30T09:56:00.000Z',
    },
    cohort: {
      id: '36.0:mage:abc',
      patchVersion: '36.0',
      patchPublishedAt: '2026-07-20T00:00:00.000Z',
      poolFingerprint: 'abc',
      from: '2026-07-20T00:00:00.000Z',
      to: '2026-07-30T09:00:00.000Z',
    },
    summary: {
      runsAvailable: 500,
      runsAnalyzed: 500,
      redraftRuns: 42,
      recordCounts: { '12 - 0': 120, '12 - 1': 180, '12 - 2': 200 },
      warnings: [],
    },
    availableClasses: [
      { id: 'ALL', label: 'Все классы', runs: 500 },
      { id: selectedClass, label: selectedClass === 'MAGE' ? 'Маг' : 'Охотник', runs: 60 },
    ],
    methodology: {
      sampleLimit: 500,
      minimumPairRuns: 12,
      minimumLift: 1.25,
      packageFilterShare: 0.8,
      classStratified: true,
      outcomeMetric: '12-win run quality',
      note: 'test',
    },
    dataQuality: {
      status: 'healthy',
      score: 100,
      metrics: {
        sourceRows: 500,
        validRuns: 500,
        invalidRuns: 0,
        duplicateRuns: 0,
        futureRuns: 0,
        impossibleDecks: 0,
        unknownCardReferences: 0,
        totalCardReferences: 15_000,
        maxClassShare: 0.2,
        maxPlayerShare: 0.01,
        sourceAgeHours: 1,
        volumeRatioToPrevious: 1,
      },
      checks: [],
    },
    reliability: {
      sampleMode: options.advisorReady === false ? 'insufficient' : 'stable',
      servedFrom: 'live',
      currentWeight: 1,
      historicalWeight: 0,
      stableAtRuns: 40,
      previousCohortId: null,
      limitations: [],
    },
    ...(options.advisorReady === false ? {} : {
      draftAdvisor: {
        status: 'shadow',
        deckSize: 30,
        minimumRuns: 20,
        cards,
        copyProfiles: [],
        targetCurve: [
          { id: 'LOW', label: '0–2', minimumCost: 0, maximumCost: 2, targetShare: 0.4, targetCount: 12 },
          { id: 'MID', label: '3–4', minimumCost: 3, maximumCost: 4, targetShare: 0.33, targetCount: 10 },
          { id: 'HIGH', label: '5–6', minimumCost: 5, maximumCost: 6, targetShare: 0.17, targetCount: 5 },
          { id: 'TOP', label: '7+', minimumCost: 7, maximumCost: null, targetShare: 0.1, targetCount: 3 },
        ],
        pairCoverage: 0,
        limitations: ['Только успешные финальные колоды.'],
      },
    }),
    history: [],
    combinations: [],
    redraft: [],
  };
}

let loadCalls = 0;
let upstreamFails = false;
let reportedError: unknown;
const app = express();
app.use(express.json());
app.use('/api', createAdminArenaSynergyRouter({
  adminGuard: (request, response, next) => (
    request.headers['x-test-admin'] === '1'
      ? next()
      : response.status(401).json({ error: 'Требуется вход' })
  ),
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  csrfAllowed: request => request.headers['x-csrf-request'] === '1',
  loadAnalysis: async className => {
    loadCalls += 1;
    if (upstreamFails) throw new Error('private dataset address');
    return analysisPayload({
      selectedClass: className === 'HUNTER' ? 'HUNTER' : 'MAGE',
      advisorReady: className !== 'HUNTER',
    });
  },
  onError: error => { reportedError = error; },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/api/admin/arena-draft-advice`;
const validBody = {
  class: 'MAGE',
  deckCardIds: [],
  candidateCardIds: ['A', 'B', 'C'],
};

async function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Admin': '1',
      'X-CSRF-Request': '1',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

try {
  assert.equal((await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validBody),
  })).status, 401);

  const callsBeforeCsrf = loadCalls;
  assert.equal((await post(validBody, { 'X-CSRF-Request': '0' })).status, 403);
  assert.equal(loadCalls, callsBeforeCsrf, 'rejected cross-site mutations must not load datasets');

  const callsBeforeInvalid = loadCalls;
  const invalid = await post({ ...validBody, class: 'ALL' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json() as any).code, 'INVALID_ARENA_CLASS');
  assert.equal(loadCalls, callsBeforeInvalid, 'invalid requests must fail before upstream work');

  const oversized = await post({
    ...validBody,
    deckCardIds: Array.from({ length: 31 }, () => 'A'),
  });
  assert.equal(oversized.status, 400);
  assert.equal((await oversized.json() as any).code, 'DECK_TOO_LARGE');
  assert.equal(loadCalls, callsBeforeInvalid);

  const response = await post(validBody);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const success = await response.json() as any;
  assert.equal(success.schemaVersion, 1);
  assert.equal(success.model.id, 'arena-draft-advisor-v2');
  assert.equal(success.model.stage, 'early');
  assert.equal(success.selectedClass, 'MAGE');
  assert.equal(success.cohort.id, '36.0:mage:abc');
  assert.equal(success.sample.runsAnalyzed, 500);
  assert.equal(success.advice.choices.length, 3);
  assert.equal('model' in success.advice, false, 'model metadata must not be duplicated');
  assert.equal('combinations' in success, false);
  assert.equal('draftAdvisor' in success, false);
  assert.equal('source' in success, false);

  const unknown = await post({ ...validBody, candidateCardIds: ['A', 'B', 'UNKNOWN'] });
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json() as any).code, 'UNKNOWN_CARD');

  const notReady = await post({ ...validBody, class: 'HUNTER' });
  assert.equal(notReady.status, 409);
  assert.equal((await notReady.json() as any).code, 'ARENA_DRAFT_ADVISOR_NOT_READY');

  upstreamFails = true;
  const failed = await post(validBody);
  assert.equal(failed.status, 502);
  const failure = await failed.json() as any;
  assert.equal(failure.code, 'ARENA_DRAFT_ADVICE_UNAVAILABLE');
  assert.equal(JSON.stringify(failure).includes('private dataset address'), false);
  assert.ok(reportedError instanceof Error);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin arena draft advice routes tests passed');
