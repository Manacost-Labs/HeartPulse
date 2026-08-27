import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectHttpRouteManifest } from '../scripts/http-route-manifest.mjs';

function writeFixture(repositoryRoot, relativePath, contents) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

test('extracts exact Express paths, middleware order and guard evidence', () => {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'hearthpulse-http-manifest-'));
  try {
    writeFixture(repositoryRoot, 'server/exampleRoutes.ts', [
      "import { Router } from 'express';",
      'const unrelated = new Map();',
      "unrelated.get('not-a-route');",
      'export function createExampleRouter() {',
      '  const router = Router();',
      "  const kindPattern = ':kind(heroes|coins)';",
      "  const proxyRoutes = [['/one', '/upstream-one'], ['/two', '/upstream-two']] as const;",
      "  router.use('/admin', adminGuard, auditMiddleware);",
      "  router.get('/admin/users', requestGuard, handler);",
      '  router.get(`/items/${kindPattern}`, handler);',
      '  for (const [route, upstream] of proxyRoutes) {',
      '    router.get(route, subscriptionGuard, (_request, response) => response.send(upstream));',
      '  }',
      '  router.all(/^\\/sitemaps\\/.*$/, handler);',
      '  return router;',
      '}',
      '',
    ].join('\n'));

    const manifest = collectHttpRouteManifest(repositoryRoot);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.summary.routeRegistrations, 5);
    assert.equal(manifest.summary.middlewareRegistrations, 1);
    assert.equal(manifest.summary.unresolvedPaths, 0);

    const routes = manifest.registrations.filter(entry => entry.kind === 'route');
    assert.deepEqual(routes.map(route => [route.method, route.path]), [
      ['GET', '/admin/users'],
      ['GET', '/items/:kind(heroes|coins)'],
      ['GET', '/one'],
      ['GET', '/two'],
      ['ALL', '/^\\/sitemaps\\/.*$/'],
    ]);
    assert.deepEqual(routes[0].middleware, ['requestGuard']);
    assert.deepEqual(routes[0].guardSignals, ['requestGuard']);
    assert.equal(routes[0].handler, 'handler');
    assert.deepEqual(routes[2].middleware, ['subscriptionGuard']);
    assert.equal(routes[2].handler, '<inline-handler>');
    assert.equal(routes.at(-1).pathKind, 'regexp');

    const middleware = manifest.registrations.find(entry => entry.kind === 'middleware');
    assert.deepEqual(middleware.paths, ['/admin']);
    assert.deepEqual(middleware.handlers, ['adminGuard', 'auditMiddleware']);
    assert.deepEqual(middleware.guardSignals, ['adminGuard']);
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('checked production registration snapshot matches the current source graph', () => {
  const repositoryRoot = path.resolve(import.meta.dirname, '..');
  const checked = JSON.parse(readFileSync(
    path.join(repositoryRoot, 'config/http-route-manifest.json'),
    'utf8',
  ));
  assert.deepEqual(collectHttpRouteManifest(repositoryRoot), checked);
});
