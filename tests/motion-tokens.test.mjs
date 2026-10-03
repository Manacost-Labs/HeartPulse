import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Every transition and entrance takes its timing from the motion tokens of
// src/styles/tokens.css, so the site moves at one tempo. Exempt: endless loops
// (spinners, skeleton shimmer, ambient drift), whose period is not a UI tempo,
// and the interactions design.md protects ("Motion And Protected Interactions").
const PROTECTED_FILES = new Set(['src/features/Battlegrounds.css', 'src/features/Battlegrounds.tsx']);
const PROTECTED_SELECTORS = ['.card-modal-shell', '.hs-tier-card-inner', '.card-modal-lightbox'];
const MOTION_PROPERTY = /^(transition|animation)(-(duration|delay|timing-function))?$/;
// A zero time is a switch (`visibility 0s`), not a tempo.
const RAW_TIME = /(?<![\w-])(?!0m?s\b)\d*\.?\d+m?s\b/;
const RAW_EASING = /\b(ease|ease-in|ease-out|ease-in-out|cubic-bezier|steps)\b/;

function trackedFiles(pattern) {
  return execFileSync('git', ['ls-files', pattern], { encoding: 'utf8' }).split('\n')
    .filter(file => file && !/^(public|storybook-static|dist|build|tests)\//.test(file) && !PROTECTED_FILES.has(file));
}

// Yields each declaration with the preludes of the blocks around it (selectors
// and at-rule conditions, innermost last) and its line.
function* declarations(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '));
  const blocks = [];
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== '{' && char !== '}' && char !== ';') continue;
    const text = source.slice(start, index);
    if (char === '{') blocks.push(text.trim());
    else {
      const match = /^\s*([a-z-]+)\s*:([\s\S]*)$/.exec(text);
      if (match && blocks.length) {
        const line = source.slice(0, start + text.search(/\S/)).split('\n').length;
        yield { prop: match[1], value: match[2].trim(), blocks: [...blocks], line };
      }
      if (char === '}') blocks.pop();
    }
    start = index + 1;
  }
}

function untokenized(value) {
  const literal = value.replace(/var\(--motion-[a-z-]+\)/g, '');
  return RAW_TIME.test(literal) || RAW_EASING.test(literal);
}

test('the motion tokens are defined once, in the global token file', () => {
  const tokens = readFileSync('src/styles/tokens.css', 'utf8');
  for (const name of ['instant', 'fast', 'base', 'slow', 'stagger', 'ease', 'ease-exit', 'rise']) {
    assert.match(tokens, new RegExp(`--motion-${name}:`), `--motion-${name} is defined`);
  }
});

test('stylesheets time every transition and entrance with the motion tokens', () => {
  const offenders = [];
  for (const file of trackedFiles('*.css')) {
    for (const declaration of declarations(readFileSync(file, 'utf8'))) {
      if (!MOTION_PROPERTY.test(declaration.prop) || /\binfinite\b/.test(declaration.value)) continue;
      if (declaration.blocks.some(prelude => /prefers-reduced-motion:\s*reduce/.test(prelude))) continue;
      if (PROTECTED_SELECTORS.some(name => declaration.blocks.at(-1).includes(name))) continue;
      if (untokenized(declaration.value)) {
        offenders.push(`${file}:${declaration.line} ${declaration.prop}: ${declaration.value}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'use var(--motion-*) instead of a literal duration or easing');
});

test('components time inline and utility transitions with the motion tokens', () => {
  const offenders = [];
  for (const file of trackedFiles('*.tsx')) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      const inline = /\b(transition|animation):\s*['`]([^'`]*)['`]/.exec(line);
      const utility = /\bduration-\d+\b/.exec(line);
      if (utility || (inline && !/\binfinite\b/.test(inline[2]) && untokenized(inline[2]))) {
        offenders.push(`${file}:${index + 1} ${(utility ?? inline)[0]}`);
      }
    });
  }
  assert.deepEqual(offenders, [], 'use var(--motion-*) or duration-(--motion-*) instead of a literal');
});
