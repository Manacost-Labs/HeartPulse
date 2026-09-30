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
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
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

assertDisposableOutput(outDir);
// Everything that can fail on a registry mistake is generated before the
// directory is emptied, so such a build leaves the earlier static root alone.
const seo = createPublicSeoModel(root);
const generated = [
  ['index.html', PLACEHOLDER_ENTRY],
  ['sitemap.xml', seo.sitemapIndexXml()],
  ['sitemaps/static.xml', seo.staticSitemapXml()],
];
rmSync(outDir, { recursive: true, force: true });
// The generated files come first: the copy below never replaces them, and
// `index.html` with `sitemap.xml` mark the directory as a static root.
for (const [file, content] of generated) {
  mkdirSync(dirname(join(outDir, file)), { recursive: true });
  writeFileSync(join(outDir, file), content, 'utf8');
}
// Dereference symlinks: the release must not link back into the build workspace.
cpSync(join(root, 'public'), outDir, { recursive: true, force: false, dereference: true });
makePublicReadable(outDir);

const staticUrlCount = [...seo.seoPages.values()].filter(page => page.sitemap).length;
console.log(`[static-root] ${outDir}: public assets, sitemap index and ${staticUrlCount} static URLs`);

/** Symlinks resolved, also for a path whose last segments do not exist yet. */
function realPath(path) {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : join(realPath(parent), path.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
}

/**
 * The output directory is emptied before the build. Refuse the checkout, a
 * directory that contains it, the `public/` source itself, and any existing
 * directory that is not an earlier static root.
 */
function assertDisposableOutput(directory) {
  const target = realPath(directory);
  const contains = (parent, child) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`);
  const source = realPath(join(root, 'public'));
  if (contains(target, realPath(root)) || contains(source, target)) {
    throw new Error(`[static-root] refusing to empty ${directory}: it holds the checkout or lies inside public/`);
  }
  if (!existsSync(target)) return;
  const entries = lstatSync(target).isDirectory() ? readdirSync(target) : null;
  if (!entries || (entries.length > 0 && !(entries.includes('index.html') && entries.includes('sitemap.xml')))) {
    throw new Error(`[static-root] refusing to empty ${directory}: it is not an earlier static root. `
      + 'Delete it by hand if an interrupted build left it behind');
  }
}

function makePublicReadable(path) {
  const stats = lstatSync(path);
  if (stats.isDirectory()) {
    chmodSync(path, 0o755);
    for (const child of readdirSync(path)) makePublicReadable(join(path, child));
  } else if (stats.isFile()) {
    chmodSync(path, 0o644);
  }
}
