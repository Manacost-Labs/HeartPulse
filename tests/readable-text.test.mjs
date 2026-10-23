import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// docs/specs/readable-text.md: 11px (0.6875rem) is the smallest text the site sets.
const FLOOR_REM = 0.6875;
const FLOOR_PX = 11;

const tracked = pattern => execFileSync('git', ['ls-files', pattern], { encoding: 'utf8' })
  .split('\n').filter(file => file && !file.startsWith('src/vendor/'));

test('site stylesheets never set text below 11px', () => {
  const offenders = [];
  for (const file of [...tracked('src/*.css'), ...tracked('apps/*.css')]) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      for (const match of line.matchAll(/font-size:\s*(\d*\.?\d+)(rem|px)\b/g)) {
        const value = Number(match[1]);
        if ((match[2] === 'rem' && value < FLOOR_REM) || (match[2] === 'px' && value < FLOOR_PX)) {
          offenders.push(`${file}:${index + 1} ${match[0]}`);
        }
      }
    });
  }
  assert.deepEqual(offenders, [], 'use at least 0.6875rem (11px)');
});

test('Tailwind arbitrary text sizes stay at or above 11px', () => {
  const offenders = [];
  for (const file of [...tracked('src/*.tsx'), ...tracked('apps/*.tsx')]) {
    for (const match of readFileSync(file, 'utf8').matchAll(/text-\[(\d*\.?\d+)(px|rem)\]/g)) {
      const px = match[2] === 'px' ? Number(match[1]) : Number(match[1]) * 16;
      if (px < FLOOR_PX) offenders.push(`${file} ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('<small> cannot shrink an 11px label below the floor', () => {
  assert.match(readFileSync('src/index.css', 'utf8'), /small\s*\{\s*font-size:\s*max\(0\.6875rem,\s*0\.8em\);/);
});
