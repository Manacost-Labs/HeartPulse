import assert from 'node:assert/strict';
import test from 'node:test';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

test('heroes preloads its LCP banner without adding that image to unrelated pages', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  try {
    const heroes = await fetch(`${runtime.origin}/heroes/?view=table`);
    assert.equal(heroes.status, 200);
    const html = await heroes.text();
    const imageHints = [...html.matchAll(/<link\b[^>]*>/g)]
      .map(match => match[0])
      .filter(link => link.includes('href="/wallpaper/profile-hero-hth.webp"'));
    assert.equal(imageHints.length, 1);
    assert.match(imageHints[0], /rel="preload"/);
    assert.match(imageHints[0], /as="image"/);
    assert.match(imageHints[0], /fetchPriority="high"|fetchpriority="high"/);

    const tierList = await fetch(`${runtime.origin}/tierlist/`);
    assert.equal(tierList.status, 200);
    assert.doesNotMatch(await tierList.text(), /<link\b[^>]*href="\/wallpaper\/profile-hero-hth\.webp"/);
  } finally {
    await runtime.close();
  }
});
