import assert from 'node:assert/strict';
import {
  addModalToStack,
  modalViewportVariables,
  removeModalFromStack,
  topModalId,
} from '../src/components/ModalSurface/modalSurfaceModel.js';

assert.deepEqual(addModalToStack([], 'media'), ['media']);
assert.deepEqual(
  addModalToStack(['media', 'confirm'], 'media'),
  ['confirm', 'media'],
  're-registering a surface must move it to the top without duplicating it',
);
assert.equal(topModalId(['media', 'confirm']), 'confirm');
assert.equal(topModalId([]), null);
assert.deepEqual(removeModalFromStack(['media', 'confirm', 'help'], 'confirm'), ['media', 'help']);

assert.deepEqual(
  modalViewportVariables(
    { width: 390, height: 520, offsetLeft: 0, offsetTop: 287 },
    { width: 390, height: 844 },
  ),
  {
    '--modal-surface-left': '0px',
    '--modal-surface-top': '287px',
    '--modal-surface-width': '390px',
    '--modal-surface-height': '520px',
  },
  'mobile keyboards must constrain the surface to the visual viewport',
);
assert.deepEqual(
  modalViewportVariables(
    { width: Number.NaN, height: 0, offsetLeft: -4, offsetTop: Number.POSITIVE_INFINITY },
    { width: 1280, height: 720 },
  ),
  {
    '--modal-surface-left': '0px',
    '--modal-surface-top': '0px',
    '--modal-surface-width': '1280px',
    '--modal-surface-height': '720px',
  },
  'invalid visual viewport readings must fall back to the layout viewport',
);

console.log('ModalSurface model tests passed');
