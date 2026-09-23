import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalArticleUrl } from '../shared/articleImageSrc.ts';

const server = readFileSync('server/index.ts', 'utf8');
const analytics = readFileSync('server/adminBoostyAnalyticsRoutes.ts', 'utf8');
const deferredRoutes = readFileSync('src/features/DeferredRoutes.tsx', 'utf8');
const articleImageSource = readFileSync('shared/articleImageSrc.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const legendaryImageGenerator = readFileSync('server/gen_legendary_image.py', 'utf8');

assert.match(
  server,
  /KHA_VIP_WP_BASE_URL[^\n]+https:\/\/kolodahearthstone\.com/,
  'VIP links must default to the canonical .com WordPress host',
);
assert.match(
  analytics,
  /https:\/\/kolodahearthstone\.com\/wp-json\/koloda\/v1\/articles\/query/,
  'analytics must query the canonical .com endpoint',
);
for (const host of ['kolodahearthstone.ru', 'kolodahearthstone.com']) {
  assert.equal(
    canonicalArticleUrl(`https://${host}/article/?ref=cards#comments`),
    'https://kolodahearthstone.com/article/?ref=cards#comments',
    'public article links use the canonical host while retaining path, query and fragment',
  );
}
assert.match(
  server,
  /url:\s*canonicalArticleUrl\(/,
  'article API responses must canonicalize saved legacy links',
);
assert.match(
  articleImageSource,
  /url\.hostname\s*=\s*'kolodahearthstone\.com'/,
  'legacy article links must be rewritten without changing their path or query',
);

for (const host of ['kolodahearthstone.com', 'kolodahearthstone.ru']) {
  assert.match(
    server,
    new RegExp(`['"]${host.replaceAll('.', '\\.')}['"]`),
    `${host} must remain accepted by the server during migration`,
  );
  assert.match(
    deferredRoutes,
    new RegExp(`['"]${host.replaceAll('.', '\\.')}['"]`),
    `${host} must remain accepted by the browser during migration`,
  );
}

for (const [label, source] of [
  ['server proxy allowlist', server],
  ['browser proxy allowlist', deferredRoutes],
  ['shared image helper', articleImageSource],
]) {
  assert.doesNotMatch(
    source,
    /(?:^|[^\w.-])(?:www\.)?manacost\.ru(?:[^\w.-]|$)/,
    `${label} must not trust the unrelated bare Manacost host`,
  );
}
assert.doesNotMatch(app, /source:\s*['"]manacost\.ru['"]/, 'initial data must not name the unrelated host');
assert.doesNotMatch(
  legendaryImageGenerator,
  /manacost\.ru\/arena/,
  'generated social artwork must use the canonical HearthPulse brand',
);
assert.match(
  legendaryImageGenerator,
  /hearthpulse\.net/,
  'generated social artwork must display the canonical HearthPulse domain',
);

console.log('Koloda domain link contract passed');
