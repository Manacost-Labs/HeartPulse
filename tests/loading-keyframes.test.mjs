import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Loading placeholders share one animation: an opacity pulse that the
// compositor runs without repainting (src/shared/ui/LoadingSurface.tsx).
// A keyframe that moves background-position repaints every frame, and an
// animation that names no @keyframes silently never runs.
const CSS_FILES = execFileSync('git', ['ls-files', '*.css'], { encoding: 'utf8' }).split('\n')
  .filter(file => file && !/^(public|storybook-static|dist|build|tests)\//.test(file));
const SOURCES = CSS_FILES.map(file => ({
  file,
  css: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' ')),
}));
const NOT_A_NAME = new Set(['none', 'infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'forwards',
  'backwards', 'both', 'running', 'paused', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start',
  'step-end', 'inherit', 'initial', 'unset', 'revert']);

function keyframeBodies() {
  const bodies = new Map();
  for (const { file, css } of SOURCES) {
    for (const match of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      let depth = 1;
      let index = match.index + match[0].length;
      while (depth > 0 && index < css.length) {
        if (css[index] === '{') depth += 1;
        if (css[index] === '}') depth -= 1;
        index += 1;
      }
      bodies.set(match[1], { file, body: css.slice(match.index + match[0].length, index - 1) });
    }
  }
  return bodies;
}

function animationNames(value) {
  return value.replace(/var\([^)]*\)|[\w-]+\([^)]*\)/g, ' ').split(',')
    .flatMap(layer => layer.trim().split(/\s+/))
    .filter(token => token && !/^[-+.\d]/.test(token) && !NOT_A_NAME.has(token));
}

test('every animation names a defined @keyframes', () => {
  const defined = keyframeBodies();
  const missing = [];
  for (const { file, css } of SOURCES) {
    for (const match of css.matchAll(/(?:^|[;{\s])animation(?:-name)?\s*:\s*([^;{}]+)/g)) {
      for (const name of animationNames(match[1].replace(/!important/, ''))) {
        if (!defined.has(name)) missing.push(`${file}: ${name}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'an undefined keyframe never animates');
});

test('no keyframe animates background-position, which repaints every frame', () => {
  const offenders = [...keyframeBodies()].filter(([, { body }]) => /background-position/.test(body))
    .map(([name, { file }]) => `${file}: ${name}`);
  assert.deepEqual(offenders, []);
});

test('the shared loading pulse changes only opacity and takes the loop token', () => {
  const pulse = keyframeBodies().get('loading-pulse');
  assert.ok(pulse, 'src/index.css defines loading-pulse');
  assert.equal(pulse.file, 'src/index.css', 'the pulse is global, so legacy .skeleton blocks can use it');
  const properties = [...pulse.body.matchAll(/([a-z-]+)\s*:/g)].map(match => match[1]);
  assert.deepEqual([...new Set(properties)], ['opacity']);
  const surface = readFileSync('src/shared/ui/LoadingSurface.css', 'utf8');
  assert.match(surface, /\.loading-block\s*\{[^}]*animation:\s*loading-pulse var\(--motion-loop\)/);
  assert.match(surface, /prefers-reduced-motion: reduce\)\s*\{\s*\.loading-block\s*\{\s*animation:\s*none/);
  assert.match(readFileSync('src/styles/tokens.css', 'utf8'), /--motion-loop:/);
});

test('page loaders use the shared surface instead of their own spinners and shimmers', () => {
  const retired = ['recoverable-surface-pulse', 'cosmetics-shimmer', 'archetypes-shimmer', 'archetype-skeleton-sheen',
    'fun-deck-shimmer', 'fun-deck-spin', 'constructed-card-history-shimmer', 'vsgold-spin', 'shimmer'];
  const defined = keyframeBodies();
  assert.deepEqual(retired.filter(name => defined.has(name)), []);
});
