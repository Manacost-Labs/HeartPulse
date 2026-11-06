import test from 'node:test';
import { verifyCanonicalLinks } from './helpers/canonicalLinks.mjs';

test('guest pages link to canonical trailing-slash URLs', () => verifyCanonicalLinks('guest'));
