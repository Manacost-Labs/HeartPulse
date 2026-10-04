import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchCurrentAuthUser } from '../src/modules/identity/public.js';
import { AUTH_PREFETCH } from '../apps/public-web/lib/authPrefetch.ts';

// The document head starts the session check (apps/public-web/lib/authPrefetch.ts);
// the first check adopts that response once instead of asking again.
type Holder = { __hpAuthMe?: { at: number; response: Promise<Response | null> } };
const holder = globalThis as Holder;
const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload),
  { status, headers: { 'Content-Type': 'application/json' } });
const user = { id: 'user-1', email: 'member@example.com', name: 'Игрок', role: 'user' };
const signedIn = { user, adminAllowed: false, contestAdminAllowed: false };
const early = (response: Promise<Response | null>, age = 0) => {
  holder.__hpAuthMe = { at: performance.now() - age, response };
};

const originalFetch = globalThis.fetch;
let fetched = 0;
const fetchAnswering = (answer: () => Response) => {
  globalThis.fetch = (async () => { fetched += 1; return answer(); }) as typeof fetch;
};
try {
  // Adopted once: no second request, and the response is gone afterwards.
  fetched = 0;
  fetchAnswering(() => json(200, { user: null, adminAllowed: false, contestAdminAllowed: false }));
  early(Promise.resolve(json(200, signedIn)));
  assert.equal((await fetchCurrentAuthUser(new AbortController().signal))?.id, 'user-1');
  assert.equal(fetched, 0, 'the early response answers the first check');
  assert.equal(holder.__hpAuthMe, undefined, 'a response body is read once, so it is taken away');
  assert.equal(await fetchCurrentAuthUser(new AbortController().signal), null);
  assert.equal(fetched, 1, 'a later check asks the server itself');

  // A rate-limited or failed early answer counts as the first attempt; the retries still run.
  for (const failed of [Promise.resolve(json(429, { error: 'Слишком много запросов' })), Promise.resolve(null)]) {
    fetched = 0;
    fetchAnswering(() => json(200, signedIn));
    early(failed);
    assert.equal((await fetchCurrentAuthUser(new AbortController().signal))?.id, 'user-1');
    assert.equal(fetched, 1, 'the second attempt fetches after the early failure');
  }

  // An early answer from long ago is not adopted.
  fetched = 0;
  fetchAnswering(() => json(200, { user: null, adminAllowed: false, contestAdminAllowed: false }));
  early(Promise.resolve(json(200, signedIn)), 60_000);
  assert.equal(await fetchCurrentAuthUser(new AbortController().signal), null);
  assert.equal(fetched, 1);
  assert.equal(holder.__hpAuthMe, undefined);

  // Unmounting while the early request is still out aborts the check without a retry.
  fetched = 0;
  let release: (response: Response) => void = () => {};
  early(new Promise(resolve => { release = resolve; }));
  const controller = new AbortController();
  const pending = fetchCurrentAuthUser(controller.signal);
  controller.abort();
  await assert.rejects(pending, error => error instanceof DOMException && error.name === 'AbortError');
  release(json(200, signedIn));
  assert.equal(fetched, 0, 'an aborted check starts no retry');
} finally {
  globalThis.fetch = originalFetch;
  delete holder.__hpAuthMe;
}

// The head script stores what the identity module reads, and never rejects.
assert.match(AUTH_PREFETCH, /window\.__hpAuthMe=\{at:performance\.now\(\),response:fetch\("\/api\/auth\/me"/);
assert.match(AUTH_PREFETCH, /credentials:"same-origin",cache:"no-store"/);
assert.match(AUTH_PREFETCH, /\.catch\(function\(\)\{return null\}\)/);
const layout = readFileSync(new URL('../apps/public-web/app/layout.tsx', import.meta.url), 'utf8');
assert.match(layout, /<script dangerouslySetInnerHTML=\{\{ __html: AUTH_PREFETCH \}\} \/>\s*<\/head>/,
  'the session check starts in the head, before the body is parsed');

console.log('early session adoption tests passed');
