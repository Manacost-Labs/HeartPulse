import assert from 'node:assert/strict';
import test from 'node:test';
import { anchoredImagePreviewLayout } from '../src/shared/ui/anchoredImagePreviewLayout';

const rect = (left: number, top: number, width = 224, height = 45) => ({ left, top, right: left + width, bottom: top + height, width, height });

test('full preview opens beside its trigger and flips at the right edge', () => {
  const right = anchoredImagePreviewLayout(rect(180, 300), 1440, 900);
  assert.equal(right.width, 324);
  assert.ok(right.left > 404);
  const left = anchoredImagePreviewLayout(rect(1200, 300), 1440, 900);
  assert.ok(left.left + left.width < 1200);
});

test('low and narrow viewports contain the entire preview, including near corners', () => {
  for (const [width, height] of [[1440, 360], [768, 500], [320, 844]]) {
    for (const anchor of [rect(12, 12), rect(width - 236, height - 57)]) {
      const preview = anchoredImagePreviewLayout(anchor, width, height);
      assert.ok(preview.left >= 12);
      assert.ok(preview.top >= 12);
      assert.ok(preview.left + preview.width <= width - 12);
      assert.ok(preview.top + preview.height <= height - 12);
    }
  }
});

test('a wide trigger uses available vertical space rather than covering the trigger', () => {
  const anchor = rect(100, 650, 1000);
  const preview = anchoredImagePreviewLayout(anchor, 1200, 900);
  assert.ok(preview.top + preview.height < anchor.top);
});
