import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Content cards share one hover language (design.md "Motion And Protected
// Interactions"): they rise by --motion-lift on a pointer that can hover, at
// --motion-fast, and keyboard focus raises them the same way. Game-card hovers
// (arena tier cards, the card gallery, legendary thumbnails) keep their own.
const CARDS = [
  ['src/modules/home/ui/HomeLatestArticles.css', '.home-latest-article', ':focus-visible'],
  ['src/modules/home/ui/HomeArenaDirectory.css', '.home-arena-directory__link', ':focus-visible'],
  ['src/modules/home/ui/HomeBattlegrounds.css', '.home-bg-directory__link', ':focus-visible'],
  ['src/route-parchment.css', '.article-card-modern', ':has(:focus-visible)'],
  ['src/route-parchment.css', '.legendary-group-card', ':has(:focus-visible)'],
  ['src/route-parchment.css', '.guide-archive-card', ':focus-visible'],
  ['src/features/GuidesArchive.css', '.guide-archive-card', ':focus-visible'],
];

// Each declaration with the preludes of the blocks around it, innermost last.
function* declarations(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [];
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== '{' && char !== '}' && char !== ';') continue;
    const text = source.slice(start, index);
    if (char === '{') blocks.push(text.trim());
    else {
      const match = /^\s*([a-z-]+)\s*:([\s\S]*)$/.exec(text);
      if (match && blocks.length) yield { prop: match[1], value: match[2].trim(), blocks: [...blocks] };
      if (char === '}') blocks.pop();
    }
    start = index + 1;
  }
}

const transformsOf = (css, state) => [...declarations(css)]
  .filter(declaration => declaration.prop === 'transform' && declaration.blocks.at(-1).endsWith(state));

test('content cards lift by the shared token on hover and on keyboard focus', () => {
  for (const [file, card, focus] of CARDS) {
    const css = readFileSync(file, 'utf8');
    const hover = transformsOf(css, `${card}:hover`);
    assert.ok(hover.length > 0, `${file}: ${card} lifts on hover`);
    for (const declaration of hover) {
      assert.match(declaration.value, /var\(--motion-lift\)/, `${file}: ${card}:hover uses --motion-lift`);
      assert.doesNotMatch(declaration.value, /!important/, `${file}: ${card}:hover needs no !important`);
      assert.ok(declaration.blocks.some(prelude => /@media \(hover: hover\)/.test(prelude)),
        `${file}: ${card}:hover stays off touch screens, where a tap would leave it raised`);
    }
    const focused = transformsOf(css, `${card}${focus}`);
    assert.ok(focused.some(declaration => /var\(--motion-lift\)/.test(declaration.value)),
      `${file}: ${card}${focus} mirrors the hover lift`);
  }
});

test('content-card transforms move at the hover tempo', () => {
  for (const [file, card] of [
    ['src/modules/home/ui/HomeLatestArticles.css', '.home-latest-article'],
    ['src/modules/home/ui/HomeArenaDirectory.css', '.home-arena-directory__link'],
    ['src/modules/home/ui/Home.css', '.home-bg-directory__link'],
    ['src/features/DeferredRoutes.css', '.article-card-modern'],
    ['src/features/GuidesArchive.css', '.guide-archive-card'],
  ]) {
    const transitions = [...declarations(readFileSync(file, 'utf8'))]
      .filter(declaration => declaration.prop === 'transition' && declaration.blocks.at(-1).endsWith(card));
    assert.equal(transitions.length, 1, `${file}: ${card} declares its transition once`);
    assert.match(transitions[0].value, /transform var\(--motion-fast\)/, `${file}: ${card} lifts at --motion-fast`);
  }
});
