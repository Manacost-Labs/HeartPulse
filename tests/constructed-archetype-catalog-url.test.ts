import assert from 'node:assert/strict';
import {
  readInitialCatalogFilters,
  replaceCatalogUrl,
  type ArchetypeClassFilter,
} from '../src/features/constructedArchetypeCatalogUrl';

const classes: { id: ArchetypeClassFilter }[] = [{ id: 'all' }, { id: 'mage' }];
assert.deepEqual(readInitialCatalogFilters('?format=wild&class=mage', classes), {
  format: 'wild', classFilter: 'mage',
});
assert.deepEqual(readInitialCatalogFilters('?format=invalid&class=admin', classes), {
  format: 'standard', classFilter: 'all',
});

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const paths: string[] = [];
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { history: { state: { step: 1 }, replaceState: (_state: unknown, _unused: string, path: string) => paths.push(path) } },
});
try {
  replaceCatalogUrl('wild', 'mage');
  replaceCatalogUrl('standard', 'all');
  assert.deepEqual(paths, ['/standard/archetypes?format=wild&class=mage', '/standard/archetypes?format=standard']);
} finally {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
}

console.log('constructed archetype catalog URL contract passed');
