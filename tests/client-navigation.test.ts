import assert from 'node:assert/strict';
import { shouldHandleClientNavigation } from '../src/routing/clientNavigation';

const siteOrigin = 'https://hearthpulse.net';

function navigation(overrides: Partial<Parameters<typeof shouldHandleClientNavigation>[0]> = {}) {
  return shouldHandleClientNavigation({
    button: 0,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    href: '/standard/meta',
    target: null,
    download: false,
    optOut: false,
    origin: siteOrigin,
    ...overrides,
  });
}

assert.equal(navigation()?.href, `${siteOrigin}/standard/meta`);
assert.equal(navigation({ href: '/?login' })?.href, `${siteOrigin}/?login`);
assert.equal(navigation({ href: 'https://example.com' }), null, 'external navigation must keep browser behavior');
assert.equal(navigation({ href: 'http://[' }), null, 'invalid hrefs must not break the click handler');
assert.equal(navigation({ href: '/api/auth/login' }), null, 'API routes must not be claimed by the client router');
assert.equal(navigation({ href: '/r/referral' }), null, 'referral redirects must keep their document navigation');
assert.equal(navigation({ href: '#faq' }), null, 'in-page anchors must retain native scrolling');
assert.equal(navigation({ target: '_blank' }), null, 'new-tab links must remain native');
assert.equal(navigation({ download: true }), null, 'downloads must remain native');
assert.equal(navigation({ ctrlKey: true }), null, 'modified clicks must remain native');
assert.equal(navigation({ optOut: true }), null, 'explicit opt-outs must remain native');

console.log('client navigation assertions passed');
