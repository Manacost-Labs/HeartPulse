import { fileURLToPath } from 'node:url';
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

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
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: true,
  // Resolve metadata and absence before the response starts, including browsers.
  htmlLimitedBots: /.*/,
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
};
export default config;
