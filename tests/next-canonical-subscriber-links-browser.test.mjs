import test from 'node:test';
import { verifyCanonicalLinks } from './helpers/canonicalLinks.mjs';

test('subscriber pages and card intent use canonical trailing-slash URLs', () => verifyCanonicalLinks('subscriber'));
