const ADMIN_WORKSPACE_JS_MARKER = 'admin-primary-navigation';
const ADMIN_WORKSPACE_CSS_MARKER = '--admin-nav-w:';
const ADMIN_WORKSPACE_SOURCE = 'src/modules/adminWorkspace/AdminWorkspaceShell.lazy.ts';

function assertManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Vite manifest must be an object');
  }
}

function localAssetPath(value, context) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${context} must name an asset`);
  }

  const withoutSuffix = value.split(/[?#]/, 1)[0];
  if (/^(?:[a-z]+:)?\/\//i.test(withoutSuffix)) return null;

  const normalized = withoutSuffix.replace(/^\.\//, '').replace(/^\//, '');
  if (
    normalized.includes('\\')
    || normalized.split('/').includes('..')
  ) {
    throw new Error(`${context} escapes the build output`);
  }

  return normalized.startsWith('assets/') ? normalized : null;
}

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  ));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function collectHtmlAssets(html) {
  const js = new Set();
  const css = new Set();

  for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    const isScript = /^<script\b/i.test(tag);
    const source = attributeValue(tag, isScript ? 'src' : 'href');
    if (!source) continue;

    const asset = localAssetPath(source, 'HTML asset');
    if (!asset) continue;

    if (isScript) {
      if (attributeValue(tag, 'type') === 'module' && asset.endsWith('.js')) js.add(asset);
      continue;
    }

    const rel = (attributeValue(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    if (rel.includes('stylesheet') && asset.endsWith('.css')) css.add(asset);
    if (rel.includes('modulepreload') && asset.endsWith('.js')) js.add(asset);
  }

  return { js, css };
}

function collectManifestAssets(manifest) {
  const entries = Object.entries(manifest).filter(([key, chunk]) => (
    chunk
    && typeof chunk === 'object'
    && chunk.isEntry === true
    && (chunk.src === 'index.html' || key === 'index.html')
  ));
  if (entries.length !== 1) {
    throw new Error(`Vite manifest must contain one index.html entry; found ${entries.length}`);
  }

  const js = new Set();
  const css = new Set();
  const visited = new Set();

  function visit(key) {
    if (visited.has(key)) return;
    const chunk = manifest[key];
    if (!chunk || typeof chunk !== 'object') {
      throw new Error(`Vite manifest is missing static import ${key}`);
    }
    visited.add(key);

    const file = localAssetPath(chunk.file, `Vite manifest chunk ${key}`);
    if (file?.endsWith('.js')) js.add(file);

    for (const stylesheet of chunk.css ?? []) {
      const asset = localAssetPath(stylesheet, `Vite manifest CSS for ${key}`);
      if (asset?.endsWith('.css')) css.add(asset);
    }

    for (const importedKey of chunk.imports ?? []) {
      if (typeof importedKey !== 'string') {
        throw new Error(`Vite manifest static import for ${key} must be a string`);
      }
      visit(importedKey);
    }
  }

  visit(entries[0][0]);
  return { js, css };
}

function collectAdminWorkspaceAssets(manifest) {
  const chunks = Object.values(manifest).filter(chunk => (
    chunk
    && typeof chunk === 'object'
    && chunk.src === ADMIN_WORKSPACE_SOURCE
  ));
  if (chunks.length !== 1) {
    throw new Error(
      `Vite manifest must contain one ${ADMIN_WORKSPACE_SOURCE} chunk; found ${chunks.length}`,
    );
  }

  const chunk = chunks[0];
  const file = localAssetPath(chunk.file, `Vite manifest chunk ${ADMIN_WORKSPACE_SOURCE}`);
  const css = (chunk.css ?? []).map(stylesheet => (
    localAssetPath(stylesheet, `Vite manifest CSS for ${ADMIN_WORKSPACE_SOURCE}`)
  )).filter(Boolean);
  if (!file?.endsWith('.js')) {
    throw new Error(`Vite manifest chunk ${ADMIN_WORKSPACE_SOURCE} must emit JavaScript`);
  }
  if (css.length === 0 || css.some(asset => !asset.endsWith('.css'))) {
    throw new Error(`Vite manifest chunk ${ADMIN_WORKSPACE_SOURCE} must emit CSS`);
  }

  return { js: [file], css };
}

export function auditAdminWorkspaceAssets({ manifest, html, readAsset }) {
  assertManifest(manifest);
  if (typeof html !== 'string') throw new Error('Built index HTML must be a string');
  if (typeof readAsset !== 'function') throw new Error('readAsset must be a function');

  const manifestAssets = collectManifestAssets(manifest);
  const htmlAssets = collectHtmlAssets(html);
  const initial = {
    js: [...new Set([...manifestAssets.js, ...htmlAssets.js])],
    css: [...new Set([...manifestAssets.css, ...htmlAssets.css])],
  };
  const leaks = {
    js: initial.js.filter(asset => {
      const source = readAsset(asset);
      if (typeof source !== 'string') throw new Error(`Unable to read initial asset ${asset}`);
      return source.includes(ADMIN_WORKSPACE_JS_MARKER);
    }),
    css: initial.css.filter(asset => {
      const source = readAsset(asset);
      if (typeof source !== 'string') throw new Error(`Unable to read initial asset ${asset}`);
      return source.includes(ADMIN_WORKSPACE_CSS_MARKER);
    }),
  };

  return {
    initial,
    shell: collectAdminWorkspaceAssets(manifest),
    leaks,
  };
}
