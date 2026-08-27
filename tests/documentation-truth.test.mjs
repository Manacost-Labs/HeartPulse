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
