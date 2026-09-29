import assert from 'node:assert/strict';
import test from 'node:test';
import { searchParamsQuery } from '../apps/public-web/lib/searchParams';

test('search params keep request order and repeated values', () => {
  assert.equal(searchParamsQuery({ q: 'mage', class: ['druid', 'hunter'], empty: undefined }),
    'q=mage&class=druid&class=hunter');
});

test('no params serialize to an empty query', () => {
  assert.equal(searchParamsQuery({}), '');
});
