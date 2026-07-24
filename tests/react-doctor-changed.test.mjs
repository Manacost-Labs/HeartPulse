import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildDoctorArgs,
  changedFrontendFiles,
  isFrontendSource,
  resolveBase,
} from '../scripts/react-doctor-changed.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

test('base ref priority is deterministic for local, PR and push runs', () => {
  const refs = new Map([
    ['release-base', 'a'.repeat(40)],
    ['origin/main', 'b'.repeat(40)],
    ['origin/release', 'c'.repeat(40)],
    ['HEAD^', 'd'.repeat(40)],
    ['e'.repeat(40), 'e'.repeat(40)],
  ]);
  const resolveRef = ref => refs.get(ref) ?? null;

  assert.equal(resolveBase({ REACT_DOCTOR_BASE: 'release-base' }, resolveRef), 'a'.repeat(40));
  assert.equal(resolveBase({ GITHUB_BASE_REF: 'release' }, resolveRef), 'c'.repeat(40));
  assert.equal(
    resolveBase({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_BEFORE: 'e'.repeat(40) }, resolveRef),
    'e'.repeat(40),
  );
  assert.equal(resolveBase({ GITHUB_ACTIONS: 'true' }, resolveRef), 'd'.repeat(40));
  assert.equal(resolveBase({}, resolveRef), 'b'.repeat(40));
});

test('frontend scope includes authored JS/TS and excludes styles, server code and vendored code', () => {
  assert.equal(isFrontendSource('src/App.tsx'), true);
  assert.equal(isFrontendSource('src/model/data.ts'), true);
  assert.equal(isFrontendSource('src/vendor/library.js'), false);
  assert.equal(isFrontendSource('src/App.css'), false);
  assert.equal(isFrontendSource('server/index.ts'), false);
});

test('doctor invocation is changed-only, telemetry-free and blocks only new errors', () => {
  const args = buildDoctorArgs('origin/main');
  assert.deepEqual(args, [
    '.',
    '--no-telemetry',
    '--verbose',
    '--scope', 'changed',
    '--base', 'origin/main',
    '--blocking', 'error',
    '--no-dead-code',
  ]);
});

test('changed-file discovery handles a controlled React fixture without historical files', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'manacost-react-doctor-'));
  try {
    git(cwd, 'init', '-q');
    git(cwd, 'config', 'user.name', 'React Doctor Test');
    git(cwd, 'config', 'user.email', 'react-doctor-test@example.invalid');
    mkdirSync(join(cwd, 'src'), { recursive: true });
    mkdirSync(join(cwd, 'server'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'App.tsx'), 'export function App() { return <main />; }\n');
    writeFileSync(join(cwd, 'server', 'index.ts'), 'export const server = true;\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-qm', 'baseline');

    writeFileSync(join(cwd, 'src', 'App.tsx'), 'export function App() { return <main><button>Save</button></main>; }\n');
    writeFileSync(join(cwd, 'server', 'index.ts'), 'export const server = false;\n');

    assert.deepEqual(changedFrontendFiles('HEAD', cwd), ['src/App.tsx']);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
