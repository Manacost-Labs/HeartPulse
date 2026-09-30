import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { useRouteErrorRecovery } from '../apps/public-web/ui/useRouteErrorRecovery';
import { classifyAppError, createIncidentId } from '../src/components/appErrorRecovery';
import { registerAppIncident } from '../src/telemetry/clientIncident';

for (const error of [
  new Error('ChunkLoadError'),
  new Error('Loading chunk 42 failed'),
  new TypeError('Failed to fetch dynamically imported module: /assets/route.js'),
  new Error('Importing a module script failed'),
  'error loading dynamically imported module',
  new Error('Unable to preload CSS for /assets/GlobalUtilityHeader-test.css'),
]) {
  assert.equal(classifyAppError(error), 'chunk');
}
assert.equal(classifyAppError(new TypeError('Cannot read properties of undefined')), 'render');
assert.equal(classifyAppError(new Error('Image load failed')), 'render');

const firstIncident = createIncidentId();
const secondIncident = createIncidentId();
assert.match(firstIncident, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
assert.notEqual(firstIncident, secondIncident);

const originalFetch = globalThis.fetch;
let diagnosticRequest: { input: string; init?: RequestInit } | null = null;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  diagnosticRequest = { input: String(input), init };
  return new Response(null, { status: 200 });
}) as typeof fetch;
registerAppIncident(firstIncident, {
  kind: 'render',
  releaseId: 'abcdef1234567890',
  error: new TypeError('Cannot render dataset'),
  componentStack: 'at StandardOperationsLegacy',
  scope: 'application-root',
});
globalThis.fetch = originalFetch;
assert.equal(diagnosticRequest?.input, '/api/telemetry/client-errors');
assert.equal(new Headers(diagnosticRequest?.init?.headers).get('content-type'), 'application/json');
assert.equal(diagnosticRequest?.init?.keepalive, true);
assert.equal(diagnosticRequest?.init?.method, 'POST');
assert.equal(diagnosticRequest?.init?.credentials, 'omit');
const diagnosticBody = JSON.parse(String(diagnosticRequest?.init?.body));
assert.match(diagnosticBody.stack, /TypeError: Cannot render dataset/);
assert.deepEqual(diagnosticBody, {
  incidentId: firstIncident,
  kind: 'render',
  releaseId: 'abcdef1234567890',
  route: '/',
  scope: 'application-root',
  errorName: 'TypeError',
  message: 'Cannot render dataset',
  stack: diagnosticBody.stack,
  componentStack: 'at StandardOperationsLegacy',
});

// Every Next.js error page recovers through one hook. A chunk that cannot load
// gets the reload copy and a full reload; any other error gets the page's own
// copy and the retry that Next.js passes to the page.
const routeRetry = () => {};
const pageCopy = { heading: 'Раздел недоступен', text: 'Попробуйте ещё раз.' };
let recovery: ReturnType<typeof useRouteErrorRecovery> | undefined;
function RecoveryProbe({ error }: { error: Error }) {
  recovery = useRouteErrorRecovery(error, routeRetry, 'route:probe', pageCopy);
  return null;
}
renderToStaticMarkup(<RecoveryProbe error={new TypeError('Cannot read properties of undefined')} />);
assert.deepEqual(recovery, { ...pageCopy, action: 'Повторить', retry: routeRetry });

renderToStaticMarkup(<RecoveryProbe error={new Error('Loading chunk 42 failed')} />);
assert.deepEqual(
  { heading: recovery?.heading, text: recovery?.text, action: recovery?.action },
  { heading: 'Сайт обновился', text: 'Вышла новая версия сайта. Обновите страницу, чтобы продолжить.', action: 'Обновить страницу' },
);
let reloads = 0;
const browserGlobals = globalThis as { window?: unknown };
browserGlobals.window = { location: { reload: () => { reloads += 1; } } };
recovery?.retry();
delete browserGlobals.window;
assert.equal(reloads, 1, 'a stale chunk needs a full reload, not a retry of the route');

for (const [errorPage, scope] of [
  ['app/error.tsx', 'route'],
  ['app/standard/cards/error.tsx', 'route:standard-cards'],
  ['app/articles/error.tsx', 'route:articles'],
  ['app/contests/error.tsx', 'route:contests'],
] as const) {
  const source = readFileSync(new URL(`../apps/public-web/${errorPage}`, import.meta.url), 'utf8');
  assert.ok(source.includes(`useRouteErrorRecovery(error, retry, '${scope}', {`), `${errorPage} must recover through the shared hook`);
  assert.match(source, /onClick=\{recovery\.retry\}/, `${errorPage} must act through the shared hook`);
  assert.doesNotMatch(source, /\breset\b|location\.reload/, `${errorPage} must not recover on its own`);
  assert.ok(source.includes(`data-app-error="${scope}"`), `${errorPage} must carry its marker`);
}
const rootErrorPage = readFileSync(new URL('../apps/public-web/app/error.tsx', import.meta.url), 'utf8');
assert.match(rootErrorPage, /error\.digest/, 'the root error page must show the server error digest');

// Incident reports carry the release that webpack compiled into the client bundle.
const nextConfigSource = readFileSync(new URL('../apps/public-web/next.config.mjs', import.meta.url), 'utf8');
assert.match(nextConfigSource, /__APP_RELEASE_SHA__/);
assert.match(nextConfigSource, /RELEASE_SHA \|\| process\.env\.GITHUB_SHA/);

console.log('App error boundary tests passed');
