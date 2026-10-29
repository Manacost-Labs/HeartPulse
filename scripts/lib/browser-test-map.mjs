/**
 * The browser test map: which pages and Storybook stories each registered
 * browser test opens, and which source files stand behind them.
 *
 * `config/browser-test-map.json` has one record per file of the `browser`
 * suite in `tests/test-suites.json`. A browser test hardly imports any source
 * (it opens a URL), so an import graph alone cannot say which pages a change
 * can break; the map says it, and the importers of the entry files are left to
 * the import graph. This module only checks the map. Nothing reads it to choose
 * tests yet.
 *
 * Record fields:
 *   routes   page routes the test opens, as route templates
 *            (`/standard/archetypes/:format/:archetypeSlug`), each a pattern of
 *            `publicRouteInventory.json` or a `page.tsx` under `apps/public-web/app`;
 *   stories  ids of the Storybook stories the test opens;
 *   entries  repository files at the start of the code under test: the
 *            `page.tsx` of every route (and `layout.tsx`), the `*.stories.tsx` of
 *            every story, or the source a test reads directly;
 *   scope    `mapped` (the entries are the whole dependency) or `global` (the
 *            test walks all or most pages, so any change selects it);
 *   reason   why the scope is `global`; required for it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const BROWSER_TEST_MAP_PATH = 'config/browser-test-map.json';
export const BROWSER_SUITE_ID = 'browser';

const NEXT_APP_ROOT = 'apps/public-web/app';
const ROUTE_INVENTORY_PATH = 'src/shared/seo/publicRouteInventory.json';
const RECORD_FIELDS = new Set(['routes', 'stories', 'entries', 'scope', 'reason']);
const SCOPES = new Set(['mapped', 'global']);
const STORY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Route templates of the Next app: `app/standard/cards/[format]/page.tsx` is `/standard/cards/:format`. */
function nextPageRoutes(root) {
  const routes = [];
  const walk = directory => {
    for (const item of readdirSync(path.join(root, NEXT_APP_ROOT, directory), { withFileTypes: true })) {
      const relative = directory === '' ? item.name : `${directory}/${item.name}`;
      if (item.isDirectory()) walk(relative);
      else if (item.name === 'page.tsx') {
        const segments = directory === '' ? [] : directory.split('/');
        routes.push(`/${segments.map(segment => segment.replace(/^\[(.+)\]$/, ':$1')).join('/')}`);
      }
    }
  };
  walk('');
  return routes;
}

/** Every route a map record may name: the SEO route inventory plus the pages of the Next app. */
export function collectKnownRoutes(root) {
  const inventory = JSON.parse(readFileSync(path.join(root, ROUTE_INVENTORY_PATH), 'utf8'));
  return new Set([...inventory.routes.map(route => route.pattern), ...nextPageRoutes(root)]);
}

function isRepositoryPath(value) {
  return typeof value === 'string' && value !== '' && !path.posix.isAbsolute(value)
    && !value.includes('\\') && path.posix.normalize(value) === value && !value.startsWith('../');
}

function stringList(record, field, problems, label) {
  const value = record[field];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item === '')) {
    problems.push(`${label}: "${field}" must be a list of non-empty strings`);
    return [];
  }
  const duplicate = value.find((item, index) => value.indexOf(item) !== index);
  if (duplicate !== undefined) problems.push(`${label}: "${field}" lists ${duplicate} twice`);
  return value;
}

/**
 * Checks the map against the test registry and the repository.
 *
 * @param {object} input
 * @param {object} input.map parsed `config/browser-test-map.json`
 * @param {object} input.registry parsed `tests/test-suites.json`
 * @param {Set<string>} input.knownRoutes route templates a record may name
 * @param {(repositoryPath: string) => boolean} input.fileExists whether a repository file exists
 * @returns {string[]} one message per problem; empty when the map is valid
 */
export function validateBrowserTestMap({ map, registry, knownRoutes, fileExists }) {
  const problems = [];
  if (!map || map.version !== 1 || typeof map.tests !== 'object' || map.tests === null || Array.isArray(map.tests)) {
    return [`${BROWSER_TEST_MAP_PATH}: expected {"version": 1, "tests": {...}}`];
  }
  const browserFiles = registry.suites.find(suite => suite.id === BROWSER_SUITE_ID)?.files ?? [];
  for (const file of browserFiles) {
    if (!Object.hasOwn(map.tests, file)) {
      problems.push(`${file}: browser test has no record in ${BROWSER_TEST_MAP_PATH}; add one (mapped with entries, or global with a reason)`);
    }
  }
  for (const file of Object.keys(map.tests)) {
    if (!browserFiles.includes(file)) {
      problems.push(`${file}: record in ${BROWSER_TEST_MAP_PATH} is not a file of the "${BROWSER_SUITE_ID}" suite in tests/test-suites.json`);
    }
  }
  for (const [file, record] of Object.entries(map.tests)) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      problems.push(`${file}: record must be an object`);
      continue;
    }
    const label = file;
    for (const field of Object.keys(record)) {
      if (!RECORD_FIELDS.has(field)) problems.push(`${label}: unknown field "${field}"`);
    }
    const routes = stringList(record, 'routes', problems, label);
    const stories = stringList(record, 'stories', problems, label);
    const entries = stringList(record, 'entries', problems, label);
    for (const route of routes) {
      if (!knownRoutes.has(route)) {
        problems.push(`${label}: route ${route} is neither in ${ROUTE_INVENTORY_PATH} nor a page of ${NEXT_APP_ROOT}`);
      }
    }
    for (const story of stories) {
      if (!STORY_ID.test(story)) problems.push(`${label}: story id ${story} must look like "component-title--story-name"`);
    }
    for (const entry of entries) {
      if (!isRepositoryPath(entry)) problems.push(`${label}: entry ${entry} is not a normalized repository-relative path`);
      else if (!fileExists(entry)) problems.push(`${label}: entry ${entry} does not exist`);
    }
    if (!SCOPES.has(record.scope)) {
      problems.push(`${label}: scope must be "mapped" or "global", got ${JSON.stringify(record.scope)}`);
    } else if (record.scope === 'global') {
      if (typeof record.reason !== 'string' || record.reason.trim() === '') {
        problems.push(`${label}: a global test needs a non-empty reason`);
      }
    } else if (entries.length === 0) {
      problems.push(`${label}: a mapped test needs at least one entry (otherwise make it global with a reason)`);
    }
  }
  return problems;
}

/** Reads the real map and registry of a checkout and validates them. */
export function validateRepositoryBrowserTestMap(root) {
  return validateBrowserTestMap({
    map: JSON.parse(readFileSync(path.join(root, BROWSER_TEST_MAP_PATH), 'utf8')),
    registry: JSON.parse(readFileSync(path.join(root, 'tests/test-suites.json'), 'utf8')),
    knownRoutes: collectKnownRoutes(root),
    fileExists: repositoryPath => existsSync(path.join(root, repositoryPath)),
  });
}
