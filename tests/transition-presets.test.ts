import assert from 'node:assert/strict';
import test from 'node:test';
import {
  entranceKeyframes,
  modalEntrancePreset,
  MODE_ORDER,
  routeTransitionFor,
  switchDirection,
} from '../src/components/transitions/transitionPresets.ts';

test('a Стандарт ↔ Вольный swap of the same page slides towards the chosen mode', () => {
  assert.deepEqual(routeTransitionFor('/standard/cards/standard/', '/standard/cards/wild/'), { preset: 'shared-x', direction: 'forward' });
  assert.deepEqual(routeTransitionFor('/standard/cards/wild/', '/standard/cards/standard/'), { preset: 'shared-x', direction: 'back' });
  // The list without a mode segment is the Standard default.
  assert.deepEqual(routeTransitionFor('/standard/cards/', '/standard/cards/wild/'), { preset: 'shared-x', direction: 'forward' });
  assert.deepEqual(routeTransitionFor('/standard/cards/wild', '/standard/cards'), { preset: 'shared-x', direction: 'back' });
  assert.deepEqual(routeTransitionFor('/standard/cards/', '/standard/cards/standard/'), { preset: 'rise', direction: 'forward' });
});

test('list → detail zooms in, the way back to the enclosing list zooms out', () => {
  assert.deepEqual(routeTransitionFor('/standard/cards/standard/', '/standard/cards/standard/12345/'), { preset: 'shared-z', direction: 'forward' });
  assert.deepEqual(routeTransitionFor('/standard/archetypes/standard/big-shaman/', '/standard/archetypes/standard/'), { preset: 'shared-z', direction: 'back' });
  // A detail page opened from another list (meta → archetype, hero tier list → hero) zooms in too.
  assert.deepEqual(routeTransitionFor('/standard/meta/', '/standard/archetypes/wild/big-shaman/'), { preset: 'shared-z', direction: 'forward' });
  assert.deepEqual(routeTransitionFor('/battlegrounds/', '/heroes/12345/'), { preset: 'shared-z', direction: 'forward' });
  assert.deepEqual(routeTransitionFor('/library/minions/', '/library/minions/murloc/'), { preset: 'shared-z', direction: 'forward' });
});

test('any other route rises; the home page nests nothing', () => {
  assert.deepEqual(routeTransitionFor('/faq/', '/guides-archive/'), { preset: 'rise', direction: 'forward' });
  assert.deepEqual(routeTransitionFor('/', '/tierlist/'), { preset: 'rise', direction: 'forward' });
  assert.deepEqual(routeTransitionFor('/heroes/12345/', '/faq/'), { preset: 'rise', direction: 'forward' });
});

test('switch direction follows the order of the buttons', () => {
  assert.equal(switchDirection(MODE_ORDER, 'standard', 'wild'), 'forward');
  assert.equal(switchDirection(MODE_ORDER, 'wild', 'standard'), 'back');
  assert.equal(switchDirection(['cards', 'tiers', 'table'], 'table', 'tiers'), 'back');
  assert.equal(switchDirection(['cards', 'tiers', 'table'], 'cards', 'table'), 'forward');
});

test('an entrance starts at once from the preset and moves only opacity and transform', () => {
  for (const preset of ['rise', 'fade-through', 'shared-x', 'shared-z', 'sheet', 'cover'] as const) {
    for (const direction of ['forward', 'back'] as const) {
      const frames = entranceKeyframes(preset, direction);
      assert.equal(frames.length, 2, `${preset} ${direction}: no hold frame delays the entrance`);
      for (const frame of frames) {
        assert.deepEqual(Object.keys(frame).filter(key => !['opacity', 'transform', 'transformOrigin'].includes(key)), [], `${preset}: compositor-only`);
      }
      assert.equal(frames.at(-1).opacity ?? 1, 1);
    }
  }
  assert.deepEqual(entranceKeyframes('shared-x', 'forward'), [{ opacity: 0, transform: 'translateX(30px)' }, { opacity: 1, transform: 'translateX(0px)' }]);
  assert.deepEqual(entranceKeyframes('shared-x', 'back'), [{ opacity: 0, transform: 'translateX(-30px)' }, { opacity: 1, transform: 'translateX(0px)' }]);
  assert.deepEqual(entranceKeyframes('sheet'), [{ transform: 'translateY(min(100%, 100vh))' }, { transform: 'translateY(0px)' }]);
});

test('reduced motion turns every entrance into a fade', () => {
  for (const preset of ['rise', 'shared-x', 'shared-z', 'sheet'] as const) {
    assert.deepEqual(entranceKeyframes(preset, 'forward', true), [{ opacity: 0 }, { opacity: 1 }]);
  }
});

test('a modal panel docked to an edge picks the sheet or the cover', () => {
  const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
  assert.equal(modalEntrancePreset(box(0, 180, 412, 915), 412, 915), 'sheet', 'a phone bottom sheet');
  assert.equal(modalEntrancePreset(box(1000, 0, 1440, 900), 1440, 900), 'cover', 'a side drawer');
  assert.equal(modalEntrancePreset(box(420, 120, 1020, 780), 1440, 900), null, 'a centred dialog keeps its own entrance');
  assert.equal(modalEntrancePreset(box(0, 0, 1440, 900), 1440, 900), null, 'a full-screen lightbox keeps its own entrance');
});
