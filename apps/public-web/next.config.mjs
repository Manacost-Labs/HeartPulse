import { fileURLToPath } from 'node:url';
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  webpack(config) {
    // The vendored UMD library must receive its own CommonJS module wrapper.
    config.module.rules.push({ test: /[\\/]src[\\/]vendor[\\/]hsreplay-deck-view[\\/]hsreplay-deck-view\.js$/, type: 'javascript/auto' });
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: true,
  // Resolve metadata and absence before the response starts, including browsers.
  htmlLimitedBots: /.*/,
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
};
export default config;
