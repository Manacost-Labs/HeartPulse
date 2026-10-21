import assert from 'node:assert/strict';
import test from 'node:test';
import { containedBox, flightTransform } from '../src/components/ModalSurface/lightboxMotion';

test('a picture contained in a wider box is centred at full height', () => {
  assert.deepEqual(containedBox({ left: 0, top: 0, width: 1000, height: 500 }, 0.5), { left: 375, top: 0, width: 250, height: 500 });
});

test('a picture contained in a taller box is centred at full width', () => {
  assert.deepEqual(containedBox({ left: 10, top: 20, width: 300, height: 900 }, 1), { left: 10, top: 320, width: 300, height: 300 });
});

test('an unknown ratio keeps the box', () => {
  assert.deepEqual(containedBox({ left: 1, top: 2, width: 3, height: 4 }, Number.NaN), { left: 1, top: 2, width: 3, height: 4 });
});

test('the flight transform maps the lightbox picture back onto the page thumbnail', () => {
  const page = { left: 100, top: 200, width: 50, height: 75 };
  const lightbox = { left: 400, top: 100, width: 200, height: 300 };
  assert.equal(flightTransform(page, lightbox), 'translate(-300px, 100px) scale(0.25, 0.25)');
});
