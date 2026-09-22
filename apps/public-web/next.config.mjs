import { fileURLToPath } from 'node:url';
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: true,
  // Resolve metadata and absence before the response starts, including browsers.
  htmlLimitedBots: /.*/,
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
};
export default config;
