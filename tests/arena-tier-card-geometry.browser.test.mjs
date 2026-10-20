import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

// Two tiers of the gallery mix spells, minions, locations, dragon-framed
// legendaries and every rarity (ArenaTierList.stories.tsx, RarityFrames).
const STORY = 'arena-tier-list-page--rarity-frames';
const RARITIES = ['common', 'rare', 'epic', 'legendary'];

test('tier-list cards share one box per row and glow by rarity at phone and desktop widths', async () => {
  const storybook = await startStorybookStatic();
  let browser;
  try {
    const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      window.__layoutShift = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__layoutShift += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    // At 560px a phone-capped 190px frame sits inside a wider card button.
    for (const [width, height] of [[1440, 900], [412, 915], [560, 900]]) {
      await page.setViewport({ width, height });
      await page.goto(storybook.storyUrl(STORY), { waitUntil: 'networkidle0' });
      await page.waitForSelector('.tierlist-card-grid .hs-tier-card img');
      const loading = await page.$$eval('.tierlist-group', groups => groups.map(group => [...group.querySelectorAll('.hs-tier-card img')]
        .map(image => image.getAttribute('loading'))));
      assert.ok(loading.slice(1).flat().every(value => value === 'lazy'), `${width}px: cards below the first tier stay lazy`);
      // Lazy images load only near the viewport; walk the page so every render arrives.
      for (const card of await page.$$('.tierlist-card-grid .hs-tier-card')) {
        await card.evaluate(element => element.scrollIntoView({ block: 'center' }));
        await page.waitForFunction(element => {
          const image = element.querySelector('img');
          return !image || (image.complete && image.naturalWidth > 0 && image.currentSrc.includes('-render'));
        }, {}, card);
      }
      await page.evaluate(() => Promise.all(document.getAnimations()
        .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map(animation => animation.finished.catch(() => {}))));
      await page.mouse.move(0, 0);
      const layout = await page.evaluate(() => {
        // The opaque area of each render, mapped through object-fit: contain
        // and the image transform into page pixels.
        const visibleArt = image => {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          let top = canvas.height, bottom = 0, left = canvas.width, right = 0;
          for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
            if (data[(y * canvas.width + x) * 4 + 3] <= 16) continue;
            top = Math.min(top, y); bottom = Math.max(bottom, y + 1); left = Math.min(left, x); right = Math.max(right, x + 1);
          }
          const box = image.getBoundingClientRect();
          const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
          const offsetX = (box.width - image.naturalWidth * scale) / 2;
          const offsetY = (box.height - image.naturalHeight * scale) / 2;
          return { left: box.left + offsetX + left * scale, right: box.left + offsetX + right * scale,
            top: box.top + offsetY + top * scale, bottom: box.top + offsetY + bottom * scale };
        };
        const glowColor = rarity => {
          const probe = document.createElement('i');
          probe.style.backgroundColor = `var(--card-rarity-glow-${rarity})`;
          document.body.append(probe);
          const color = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return color;
        };
        return {
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          layoutShift: window.__layoutShift,
          tokens: Object.fromEntries(['common', 'rare', 'epic', 'legendary'].map(rarity => [rarity, glowColor(rarity)])),
          grids: [...document.querySelectorAll('.tierlist-card-grid')].map(grid => [...grid.querySelectorAll('.hs-tier-card')].map(card => {
            const box = card.getBoundingClientRect();
            const glow = getComputedStyle(card, '::before');
            const image = card.querySelector('img');
            const frame = card.querySelector('.hs-tier-card-inner').getBoundingClientRect();
            return { frameWidth: frame.width, name: card.getAttribute('aria-label'), rarity: card.dataset.rarity, frame: card.dataset.cardFrame ?? null,
              left: box.left, top: box.top, width: box.width, height: box.height, right: box.right, bottom: box.bottom,
              glow: { color: glow.backgroundColor, opacity: glow.opacity, width: parseFloat(glow.width) },
              art: image ? visibleArt(image) : null };
          })),
        };
      });
      assert.ok(layout.scrollWidth <= layout.viewport, `${width}px: no horizontal scroll (${layout.scrollWidth} > ${layout.viewport})`);
      assert.ok(layout.layoutShift <= 0.001, `${width}px: loading every card render moves nothing (CLS ${layout.layoutShift})`);
      assert.equal(layout.grids.length, 2, `${width}px: both tiers render`);
      const cards = layout.grids.flat();
      for (const grid of layout.grids) {
        const rows = Map.groupBy(grid, card => Math.round(card.top));
        assert.ok(rows.size >= 2 || grid.length <= 6, `${width}px: the fixture wraps into several rows`);
        for (const row of rows.values()) for (const card of row) {
          assert.ok(Math.abs(card.top - row[0].top) < 0.5, `${width}px ${card.name}: shares its row's top`);
          assert.ok(Math.abs(card.width - row[0].width) < 0.5, `${width}px ${card.name}: shares its row's width`);
          assert.ok(Math.abs(card.height - row[0].height) < 0.5, `${width}px ${card.name}: shares its row's height`);
        }
      }
      for (const card of cards) {
        assert.ok(Math.abs(card.width - cards[0].width) < 0.5 && Math.abs(card.height - cards[0].height) < 0.5,
          `${width}px ${card.name}: one card box in every tier`);
        assert.ok(RARITIES.includes(card.rarity), `${width}px ${card.name}: carries its rarity`);
        assert.equal(card.glow.color, layout.tokens[card.rarity], `${width}px ${card.name}: glows in the ${card.rarity} colour`);
        assert.equal(card.glow.opacity, '0', `${width}px ${card.name}: the glow waits for hover or focus`);
        assert.ok(card.glow.width < card.frameWidth, `${width}px ${card.name}: the glow stays behind the card frame`);
        if (!card.art) continue;
        // Dragon-framed legendaries and location frames stay inside the card box.
        assert.ok(card.art.left >= card.left - 1 && card.art.right <= card.right + 1
          && card.art.top >= card.top - 1 && card.art.bottom <= card.bottom + 1, `${width}px ${card.name}: art stays in its box`);
      }
      assert.ok(cards.some(card => card.rarity === 'legendary' && card.frame === 'location'), 'fixture includes a legendary location');
      const minion = cards.find(card => card.name.includes('MINION') && card.rarity === 'rare');
      for (const location of cards.filter(card => card.frame === 'location')) {
        const minionHeight = minion.art.bottom - minion.art.top;
        const locationHeight = location.art.bottom - location.art.top;
        assert.ok(Math.abs(locationHeight - minionHeight) / minionHeight < 0.03,
          `${width}px ${location.name}: a location is as tall as a minion (${locationHeight} vs ${minionHeight})`);
        assert.ok(location.art.right - location.art.left <= minion.art.right - minion.art.left + 1,
          `${width}px ${location.name}: a location is no wider than a minion`);
      }

      for (const rarity of RARITIES) {
        const card = await page.$(`.tierlist-card-grid .hs-tier-card[data-rarity='${rarity}']`);
        await card.evaluate(element => element.scrollIntoView({ block: 'center' }));
        await card.focus();
        await page.keyboard.press('Shift');
        await page.waitForFunction(element => Number(getComputedStyle(element, '::before').opacity) >= 0.85, {}, card);
        await card.evaluate(element => element.blur());
      }
    }
    assert.deepEqual(runtimeErrors, []);
  } finally {
    await browser?.close();
    await storybook.close();
  }
});
