import assert from 'node:assert/strict';
import { cardSupportsStandardStatistics } from '../src/features/constructedCardFormats.js';

assert.equal(cardSupportsStandardStatistics(undefined), true,
  'missing format metadata must preserve the Standard fallback');
assert.equal(cardSupportsStandardStatistics([]), true,
  'empty format metadata must preserve the Standard fallback');
assert.equal(cardSupportsStandardStatistics([{ slug: 'standard' }, { slug: 'wild' }]), true);
assert.equal(cardSupportsStandardStatistics([{ slug: 'STANDARD' }]), true,
  'format matching must be case-insensitive');
assert.equal(cardSupportsStandardStatistics([{ slug: 'wild', name_ru: 'Вольный' }]), false,
  'an explicitly Wild-only card must not offer Standard statistics');

console.log('constructed-card format availability contracts passed');
