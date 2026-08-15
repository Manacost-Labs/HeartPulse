import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = ['api', 'server', 'src', 'public'];
const textExtensions = new Set(['.js', '.json', '.ts', '.tsx']);
const legacyOriginPattern = /https:\/\/(?:api\.hs-manacost\.ru|db\.kolodahs\.ru)/g;
const violations: string[] = [];

function inspectTree(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      inspectTree(path);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(extname(entry.name))) continue;

    const contents = readFileSync(path, 'utf8');
    const matches = contents.match(legacyOriginPattern);
    if (matches?.length) {
      violations.push(`${relative(root, path)} (${matches.length})`);
    }
  }
}

for (const sourceRoot of sourceRoots) inspectTree(join(root, sourceRoot));

assert.deepEqual(
  violations,
  [],
  `Production sources still depend on retired API origins:\n${violations.join('\n')}`,
);

console.log('unified API origin policy passed');
