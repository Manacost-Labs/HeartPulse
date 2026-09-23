// Only transport is replaced: the real backend owns parsing, caching and access.
if (process.env.NODE_ENV !== 'test') throw new Error('Controlled transport is test-only');
const target = new URL(process.env.CODEX_TEST_EXTERNAL_ORIGIN);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) throw new Error('Fixture must be local');
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return nativeFetch(input, init);
  if (url.hostname === 'api.kolodahearthstone.com') {
    return nativeFetch(new URL(url.pathname + url.search, target), init);
  }
  if (process.env.CODEX_TEST_CARD_IMAGES === '1' && url.hostname === 'art.hearthstonejson.com') {
    return nativeFetch(new URL('/fixture-assets' + url.pathname, target), init).then(response => {
      // Preserve the logical destination for the real proxy's final-origin check.
      Object.defineProperty(response, 'url', { value: url.href });
      return response;
    });
  }
  return Promise.reject(new Error(`External request blocked in integration fixture: ${url.hostname}`));
};
