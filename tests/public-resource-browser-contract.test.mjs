import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const roots = ['src', 'public/bg-legacy'];
const sourceExtensions = new Set(['.css', '.js', '.jsx', '.ts', '.tsx', '.json']);
const blockedHosts = [
  'db.kolodahs.ru',
  'bg.kolodahearthstone.ru',
  'art.hearthstonejson.com',
  'api.hearthstonejson.com',
  'cdn.jsdelivr.net',
  'static.hsreplay.net',
];
const baselineViolations = [
  'src/features/ArenaSynergyCardIdentity.tsx -> art.hearthstonejson.com',
  'src/features/battlegroundTrinkets.ts -> bg.kolodahearthstone.ru',
];

function collectFiles(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return collectFiles(path);
    return sourceExtensions.has(extname(path)) ? [path] : [];
  });
}

const violations = roots
  .flatMap(root => collectFiles(join(projectRoot, root)))
  .concat(join(projectRoot, 'index.html'))
  .filter(path => !path.endsWith('.stories.tsx'))
  .flatMap(path => {
    const source = readFileSync(path, 'utf8');
    return blockedHosts
      .filter(host => source.includes(`https://${host}`))
      .map(host => `${path.slice(projectRoot.length + 1)} -> ${host}`);
  });

assert.deepEqual(
  violations,
  baselineViolations,
  `production browser sources changed their direct-host baseline:\n${violations.join('\n')}`,
);

console.log('public resource browser contract tests passed');
