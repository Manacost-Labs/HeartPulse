import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const read = relativePath => readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('README describes the measured TypeScript and test baseline truthfully', () => {
  const tsconfig = JSON.parse(read('tsconfig.json'));
  const readme = read('README.md');

  assert.notEqual(tsconfig.compilerOptions.strict, true, 'fixture expects project-wide strict mode to remain disabled');
  assert.doesNotMatch(readme, /TypeScript strict/i);
  assert.match(readme, /TypeScript с измеряемым долгом/i);
  assert.match(readme, /src\/features\/\s+legacy/i);
  assert.match(readme, /пять автоматически обнаруживаемых suite/i);
});

test('documentation homes have one explicit ownership contract', () => {
  const docsIndex = read('docs/README.md');
  assert.match(docsIndex, /docs\/decisions\/.*единственный каталог ADR/is);
  assert.match(docsIndex, /docs\/operations\/.*фактическое состояние/is);
  assert.match(docsIndex, /docs\/runbooks\/.*пошаговые процедуры/is);

  const legacyAdrDirectory = path.join(repositoryRoot, 'docs/adr');
  assert.equal(
    existsSync(legacyAdrDirectory) && readdirSync(legacyAdrDirectory).length > 0,
    false,
    'legacy docs/adr must not become a second decision home',
  );
});

// ADRs from before the dated naming rule keep their names; the list is closed.
const LEGACY_ADR_FILES = new Set([
  '0001-public-url-indexability.md',
  '0002-unified-deck-render-platform.md',
  '001-main-auto-deploy-and-agent-coordination.md',
  '002-domain-modules-and-documentation-contract.md',
  '003-versioned-public-api-and-api-keys.md',
  '004-desktop-device-authorization.md',
  '005-complete-normalized-statistics-contract.md',
  '006-quality-gated-arena-draft-refresh.md',
  '007-numeric-public-profile-identities.md',
  '008-timeweb-cdn-for-public-images.md',
  '009-global-edge-delivery-and-private-api-boundary.md',
  'manacost-reader-identity.md',
  'nextjs-battleground-detail-status.md',
  'nextjs-public-card-pilot.md',
  'session-cookies-written-at-sign-in.md',
]);

test('new ADRs are named by date so parallel branches never pick the same number', () => {
  const files = readdirSync(path.join(repositoryRoot, 'docs/decisions')).filter(file => file !== 'README.md');
  const misnamed = files.filter(file => !LEGACY_ADR_FILES.has(file) && !/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file));
  assert.deepEqual(misnamed, [], 'name a new ADR docs/decisions/YYYY-MM-DD-<slug>.md (docs/decisions/README.md)');
  for (const file of files.filter(name => /^\d{4}-\d{2}-\d{2}-/.test(name))) {
    assert.ok(!Number.isNaN(Date.parse(`${file.slice(0, 10)}T00:00:00Z`)), `${file}: invalid date`);
  }
});
