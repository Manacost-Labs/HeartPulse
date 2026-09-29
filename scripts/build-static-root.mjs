#!/usr/bin/env node
/**
 * Assembles the release static root (`dist/` by default) without Vite.
 *
 * Nginx, regional edges, the deployer and Express read static files, the SEO
 * sitemap segment and the entry document from this directory. Every HTML page
 * is rendered by Next.js, so the tree only needs `public/`, the generated
 * sitemaps and a placeholder entry document. While the legacy Vite build still
 * runs first, its bundle and entry document are kept; this step never deletes.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPublicSeoModel } from './lib/public-seo-model.mjs';

const root = process.cwd();
const outArgument = process.argv.find(argument => argument.startsWith('--out='));
const outDir = resolve(root, outArgument ? outArgument.slice('--out='.length) : 'dist');

// Release, deploy and edge-sync contracts require a non-empty entry document.
// Nginx proxies every HTML route to Next.js, so visitors never receive it.
const PLACEHOLDER_ENTRY = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex, nofollow" />
    <title>HearthPulse</title>
  </head>
  <body>
    <p><a href="/">HearthPulse</a></p>
  </body>
</html>
`;

const seo = createPublicSeoModel(root);
mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'public'), outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'sitemaps'), { recursive: true });
writeFileSync(join(outDir, 'sitemaps', 'static.xml'), seo.staticSitemapXml(), 'utf8');
writeFileSync(join(outDir, 'sitemap.xml'), seo.sitemapIndexXml(), 'utf8');
if (!existsSync(join(outDir, 'index.html'))) writeFileSync(join(outDir, 'index.html'), PLACEHOLDER_ENTRY, 'utf8');
makePublicReadable(outDir);

const staticUrlCount = [...seo.seoPages.values()].filter(page => page.sitemap).length;
console.log(`[static-root] ${outDir}: public assets, sitemap index and ${staticUrlCount} static URLs`);

function makePublicReadable(path) {
  const stats = statSync(path);
  if (stats.isDirectory()) {
    chmodSync(path, 0o755);
    for (const child of readdirSync(path)) makePublicReadable(join(path, child));
  } else if (stats.isFile()) {
    chmodSync(path, 0o644);
  }
}
