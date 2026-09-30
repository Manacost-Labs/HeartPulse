#!/usr/bin/env node
/**
 * Assembles the release static root (`dist/` by default).
 *
 * Nginx, regional edges, the deployer and Express read static files, the SEO
 * sitemap segment and the entry document from this directory. Every HTML page
 * is rendered by Next.js, so the tree only needs `public/`, the generated
 * sitemaps and a placeholder entry document. The directory is rebuilt from
 * scratch: a reused workspace must not ship files of an earlier build.
 */
import { chmodSync, cpSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
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

// The output directory is emptied, so it must never be the checkout or contain it.
if (outDir === root || root.startsWith(outDir.endsWith(sep) ? outDir : `${outDir}${sep}`)) {
  throw new Error(`[static-root] refusing to empty ${outDir}`);
}
const seo = createPublicSeoModel(root);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
// Dereference symlinks: the release must not link back into the build workspace.
cpSync(join(root, 'public'), outDir, { recursive: true, force: true, dereference: true });
mkdirSync(join(outDir, 'sitemaps'), { recursive: true });
writeFileSync(join(outDir, 'sitemaps', 'static.xml'), seo.staticSitemapXml(), 'utf8');
writeFileSync(join(outDir, 'sitemap.xml'), seo.sitemapIndexXml(), 'utf8');
writeFileSync(join(outDir, 'index.html'), PLACEHOLDER_ENTRY, 'utf8');
makePublicReadable(outDir);

const staticUrlCount = [...seo.seoPages.values()].filter(page => page.sitemap).length;
console.log(`[static-root] ${outDir}: public assets, sitemap index and ${staticUrlCount} static URLs`);

function makePublicReadable(path) {
  const stats = lstatSync(path);
  if (stats.isDirectory()) {
    chmodSync(path, 0o755);
    for (const child of readdirSync(path)) makePublicReadable(join(path, child));
  } else if (stats.isFile()) {
    chmodSync(path, 0o644);
  }
}
