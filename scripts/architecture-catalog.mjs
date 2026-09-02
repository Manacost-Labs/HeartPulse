import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const MODULE_ROOTS = ['src/modules', 'server/modules'];
const REQUIRED_ARRAY_FIELDS = [
  'paths',
  'publicEntrypoints',
  'frontendRoutes',
  'backendRoutes',
  'contracts',
  'jobs',
  'cacheNamespaces',
  'dataStores',
  'externalServices',
  'tests',
  'allowedDependencies',
  'forbiddenImports',
];

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function normalizeRepositoryPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function physicalModuleDirectories(repositoryRoot) {
  return MODULE_ROOTS.flatMap(root => {
    const absoluteRoot = path.join(repositoryRoot, root);
    if (!existsSync(absoluteRoot)) return [];
    return readdirSync(absoluteRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => `${root}/${entry.name}`);
  }).sort((left, right) => left.localeCompare(right, 'en'));
}

function assertExistingPath(repositoryRoot, value, label) {
  const relativePath = normalizeRepositoryPath(nonEmptyString(value, label));
  if (!existsSync(path.join(repositoryRoot, relativePath))) {
    throw new Error(`${label} does not exist: ${relativePath}`);
  }
}

function validateStringArray(module, field, repositoryRoot, pathsMustExist = false) {
  const values = module[field];
  if (!Array.isArray(values)) throw new Error(`${module.name}.${field} must be an array`);
  for (const [index, value] of values.entries()) {
    nonEmptyString(value, `${module.name}.${field}[${index}]`);
    if (pathsMustExist) assertExistingPath(repositoryRoot, value, `${module.name}.${field}[${index}]`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${module.name}.${field} contains duplicates`);
}

function catalogEntries(catalog) {
  return [...catalog.modules, ...(catalog.legacyAreas ?? [])];
}

function validateCatalogEntry(entry, repositoryRoot, names) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('architecture catalog entry must be an object');
  }
  nonEmptyString(entry.name, 'entry name');
  if (names.has(entry.name)) throw new Error(`duplicate architecture entry: ${entry.name}`);
  names.add(entry.name);
  nonEmptyString(entry.owner, `${entry.name}.owner`);
  nonEmptyString(entry.purpose, `${entry.name}.purpose`);

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (field === 'backendRoutes') {
      if (!Array.isArray(entry.backendRoutes)) {
        throw new Error(`${entry.name}.backendRoutes must be an array`);
      }
      continue;
    }
    validateStringArray(
      entry,
      field,
      repositoryRoot,
      ['paths', 'publicEntrypoints', 'contracts', 'jobs', 'tests'].includes(field),
    );
  }
  if (entry.tests.length === 0) throw new Error(`${entry.name}.tests must not be empty`);
  if (entry.forbiddenImports.length === 0) {
    throw new Error(`${entry.name}.forbiddenImports must not be empty`);
  }
  for (const [index, route] of entry.backendRoutes.entries()) {
    if (!route || typeof route !== 'object' || Array.isArray(route)) {
      throw new Error(`${entry.name}.backendRoutes[${index}] must be an object`);
    }
    nonEmptyString(route.method, `${entry.name}.backendRoutes[${index}].method`);
    nonEmptyString(route.path, `${entry.name}.backendRoutes[${index}].path`);
  }
}

function assertExclusivePathOwnership(entries) {
  const claims = entries.flatMap(entry => entry.paths.map(value => ({
    entry,
    path: normalizeRepositoryPath(value),
  })));
  for (let leftIndex = 0; leftIndex < claims.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex += 1) {
      const left = claims[leftIndex];
      const right = claims[rightIndex];
      const overlaps = left.path === right.path
        || left.path.startsWith(`${right.path}/`)
        || right.path.startsWith(`${left.path}/`);
      if (overlaps) {
        throw new Error(
          `overlapping architecture paths: ${left.entry.name}:${left.path} and ${right.entry.name}:${right.path}`,
        );
      }
    }
  }
}

function routeOwnershipKey(pattern) {
  return pattern
    .split('/')
    .map(segment => segment.startsWith(':') ? ':parameter' : segment)
    .join('/');
}

function assertUniqueRouteOwnership(entries) {
  const frontendOwners = new Map();
  for (const entry of entries) {
    for (const route of entry.frontendRoutes) {
      const key = routeOwnershipKey(route);
      const existingOwner = frontendOwners.get(key);
      if (existingOwner && existingOwner !== entry.name) {
        throw new Error(`duplicate frontend route owner: ${route}`);
      }
      frontendOwners.set(key, entry.name);
    }
  }

  const backendClaims = entries.flatMap(entry => entry.backendRoutes.map(route => ({
    entry,
    method: route.method.toUpperCase(),
    path: route.path,
    pathKey: routeOwnershipKey(route.path),
  })));
  for (let leftIndex = 0; leftIndex < backendClaims.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < backendClaims.length; rightIndex += 1) {
      const left = backendClaims[leftIndex];
      const right = backendClaims[rightIndex];
      if (left.pathKey !== right.pathKey) continue;
      if (left.method !== right.method && left.method !== '*' && right.method !== '*') continue;
      throw new Error(`duplicate backend route owner: ${left.method} ${left.path}`);
    }
  }
}

export function validateArchitectureCatalog(catalog, repositoryRoot) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error('architecture catalog must be an object');
  }
  if (catalog.version !== 1) throw new Error('architecture catalog version must be 1');
  if (!Array.isArray(catalog.modules)) throw new Error('architecture catalog modules must be an array');
  if (catalog.legacyAreas !== undefined && !Array.isArray(catalog.legacyAreas)) {
    throw new Error('architecture catalog legacyAreas must be an array');
  }

  const names = new Set();
  let modular = 0;
  let transitional = 0;
  for (const module of catalog.modules) {
    validateCatalogEntry(module, repositoryRoot, names);
    if (!['modular', 'transitional'].includes(module.status)) {
      throw new Error(`${module.name}.status must be modular or transitional`);
    }
    if (module.status === 'modular') modular += 1;
    else transitional += 1;
    if (module.paths.length === 0) throw new Error(`${module.name}.paths must not be empty`);
    if (module.status === 'modular' && module.publicEntrypoints.length === 0) {
      throw new Error(`${module.name} is modular but has no public entrypoint`);
    }
  }

  const legacyAreas = catalog.legacyAreas ?? [];
  for (const area of legacyAreas) {
    validateCatalogEntry(area, repositoryRoot, names);
    if (area.status !== 'legacy') throw new Error(`${area.name}.status must be legacy`);
    nonEmptyString(area.migrationTarget, `${area.name}.migrationTarget`);
    nonEmptyString(area.exitCriteria, `${area.name}.exitCriteria`);
    if (area.paths.length === 0
      && area.frontendRoutes.length === 0
      && area.backendRoutes.length === 0) {
      throw new Error(`${area.name} must own at least one path or route`);
    }
  }

  const entries = catalogEntries(catalog);
  assertExclusivePathOwnership(entries);
  assertUniqueRouteOwnership(entries);

  const physicalDirectories = physicalModuleDirectories(repositoryRoot);
  for (const directory of physicalDirectories) {
    const owners = catalog.modules.filter(module => module.paths.some(entry => (
      normalizeRepositoryPath(entry) === directory
    )));
    if (owners.length !== 1) {
      throw new Error(`${directory} must have exactly one catalog owner; found ${owners.length}`);
    }
  }

  return {
    modules: catalog.modules.length,
    modular,
    transitional,
    legacy: legacyAreas.length,
    physicalModuleDirectories: physicalDirectories.length,
  };
}

export function findModuleForFile(catalog, file) {
  const normalizedFile = normalizeRepositoryPath(file);
  return catalogEntries(catalog)
    .flatMap(module => module.paths.map(modulePath => ({
      module,
      modulePath: normalizeRepositoryPath(modulePath),
    })))
    .filter(entry => normalizedFile === entry.modulePath || normalizedFile.startsWith(`${entry.modulePath}/`))
    .sort((left, right) => right.modulePath.length - left.modulePath.length)[0]?.module ?? null;
}

function routeMatches(pattern, pathname) {
  const patternSegments = pattern.split('/');
  const pathSegments = pathname.split('/');
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    if (patternSegment === '**') return true;
    const pathSegment = pathSegments[index];
    if (pathSegment === undefined) return false;
    if (patternSegment.startsWith(':')) continue;
    if (patternSegment !== pathSegment) return false;
  }
  return patternSegments.length === pathSegments.length;
}

export function findRouteOwners(catalog, method, pathname) {
  const normalizedMethod = method.toUpperCase();
  return catalogEntries(catalog).filter(module => {
    if (normalizedMethod === 'FRONTEND') {
      return module.frontendRoutes.some(pattern => routeMatches(pattern, pathname));
    }
    return module.backendRoutes.some(route => (
      (route.method === '*' || route.method.toUpperCase() === normalizedMethod)
      && routeMatches(route.path, pathname)
    ));
  });
}

function catalogPath(repositoryRoot) {
  return path.join(repositoryRoot, 'config', 'architecture-catalog.json');
}

function printModule(module) {
  process.stdout.write(`${JSON.stringify(module, null, 2)}\n`);
}

function runModuleTests(module, repositoryRoot) {
  const registry = JSON.parse(readFileSync(path.join(repositoryRoot, 'tests', 'test-suites.json'), 'utf8'));
  for (const testFile of module.tests) {
    const command = testFile.endsWith('.sh')
      ? { executable: 'bash', args: [testFile] }
      : /\.(?:js|mjs|cjs)$/.test(testFile)
        ? { executable: process.execPath, args: [testFile] }
        : { executable: process.execPath, args: ['--import', 'tsx', testFile] };
    console.log(`[architecture-catalog] test ${module.name}: ${testFile}`);
    const result = spawnSync(command.executable, command.args, {
      cwd: repositoryRoot,
      env: { ...process.env, ...(registry.fileEnvironment?.[testFile] ?? {}) },
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${testFile} exited with code ${result.status}`);
  }
}

function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const catalog = JSON.parse(readFileSync(catalogPath(repositoryRoot), 'utf8'));
  const summary = validateArchitectureCatalog(catalog, repositoryRoot);
  const [command = 'map', ...args] = process.argv.slice(2);

  if (command === 'check') {
    console.log(`[architecture-catalog] ok modules=${summary.modules} modular=${summary.modular} transitional=${summary.transitional} legacy=${summary.legacy}`);
    return;
  }
  if (command === 'map') {
    for (const module of catalogEntries(catalog)) {
      console.log(`${module.name}\t${module.status}\t${module.owner}\t${module.purpose}`);
    }
    return;
  }
  if (command === 'file') {
    const module = findModuleForFile(catalog, args.join(' '));
    if (!module) throw new Error(`no module owns file: ${args.join(' ')}`);
    printModule(module);
    return;
  }
  if (command === 'route') {
    const [method, pathname] = args;
    const owners = findRouteOwners(catalog, method ?? '', pathname ?? '');
    if (owners.length === 0) throw new Error(`no module owns route: ${method ?? ''} ${pathname ?? ''}`.trim());
    process.stdout.write(`${JSON.stringify(owners, null, 2)}\n`);
    return;
  }
  const module = catalogEntries(catalog).find(entry => entry.name === args[0]);
  if (!module) throw new Error(`unknown module: ${args[0] ?? ''}`);
  if (command === 'module') printModule(module);
  else if (command === 'tests') process.stdout.write(`${module.tests.join('\n')}\n`);
  else if (command === 'test') runModuleTests(module, repositoryRoot);
  else if (command === 'dependencies') process.stdout.write(`${JSON.stringify({
    module: module.name,
    allowedDependencies: module.allowedDependencies,
    forbiddenImports: module.forbiddenImports,
  }, null, 2)}\n`);
  else throw new Error(`unknown architecture catalog command: ${command}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`[architecture-catalog] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
