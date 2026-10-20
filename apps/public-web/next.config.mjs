import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicDocumentHeaders } from './documentCaching.mjs';
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Prerendered pages with a query policy: their HTML cannot vary its robots
 * meta by query, so Next sends the policy as `X-Robots-Tag` (nginx's SEO map
 * sends the same header in production). tests/next-prerendered-robots.test.mjs
 * fails when a prerendered page with a query policy is missing here.
 */
const PRERENDERED_QUERY_ROBOTS = ['/battlegrounds/tier-list', '/guides-archive'];

function prerenderedQueryRobotsHeaders() {
  const inventory = JSON.parse(readFileSync(new URL('../../src/shared/seo/publicRouteInventory.json', import.meta.url), 'utf8'));
  return inventory.queryPolicies.flatMap(policy => policy.appliesTo
    .filter(pattern => PRERENDERED_QUERY_ROBOTS.includes(pattern))
    .flatMap(pattern => policy.parameters.map(key => ({
      source: `${pattern}/`,
      has: [{ type: 'query', key }],
      headers: [{ key: 'X-Robots-Tag', value: policy.indexPolicy === 'noindex-nofollow' ? 'noindex, nofollow' : 'noindex, follow' }],
    }))));
}

/** @type {import('next').NextConfig} */
const config = {
  webpack(config, { webpack }) {
    // The vendored UMD library must receive its own CommonJS module wrapper.
    config.module.rules.push({ test: /[\\/]src[\\/]vendor[\\/]hsreplay-deck-view[\\/]hsreplay-deck-view\.js$/, type: 'javascript/auto' });
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, '.js': ['.ts', '.tsx', '.js'] };
    const configuredRelease = String(process.env.RELEASE_SHA || process.env.GITHUB_SHA || '').trim();
    const releaseSha = /^[a-f0-9]{7,40}$/i.test(configuredRelease)
      ? configuredRelease.toLowerCase() : 'development';
    config.plugins.push(new webpack.DefinePlugin({ __APP_RELEASE_SHA__: JSON.stringify(releaseSha) }));
    return config;
  },
  // Agent rules live in the repository's AGENTS.md; `next dev` must not add its own files here.
  agentRules: false,
  // Anonymous public documents may be restored from the back/forward cache.
  async headers() {
    return [...publicDocumentHeaders(), ...prerenderedQueryRobotsHeaders()];
  },
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: true,
  // Resolve metadata and absence before the response starts, including browsers.
  htmlLimitedBots: /.*/,
  // Public pages render anonymously, so a page opened in the last 30 seconds is
  // shown again from the router cache instead of waiting for a new server render.
  experimental: { staleTimes: { dynamic: 30 } },
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
};
export default config;
