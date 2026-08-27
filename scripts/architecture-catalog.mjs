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

export function validateArchitectureCatalog(catalog, repositoryRoot) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error('architecture catalog must be an object');
  }
  if (catalog.version !== 1) throw new Error('architecture catalog version must be 1');
  if (!Array.isArray(catalog.modules)) throw new Error('architecture catalog modules must be an array');

  const names = new Set();
  let modular = 0;
  let transitional = 0;
  for (const module of catalog.modules) {
    if (!module || typeof module !== 'object' || Array.isArray(module)) {
      throw new Error('architecture catalog module must be an object');
    }
    nonEmptyString(module.name, 'module name');
    if (names.has(module.name)) throw new Error(`duplicate architecture module: ${module.name}`);
    names.add(module.name);
    nonEmptyString(module.owner, `${module.name}.owner`);
    nonEmptyString(module.purpose, `${module.name}.purpose`);
    if (!['modular', 'transitional'].includes(module.status)) {
      throw new Error(`${module.name}.status must be modular or transitional`);
    }
    if (module.status === 'modular') modular += 1;
    else transitional += 1;

    for (const field of REQUIRED_ARRAY_FIELDS) {
      if (field === 'backendRoutes') {
        if (!Array.isArray(module.backendRoutes)) {
          throw new Error(`${module.name}.backendRoutes must be an array`);
        }
        continue;
      }
      validateStringArray(
        module,
        field,
        repositoryRoot,
        ['paths', 'publicEntrypoints', 'contracts', 'jobs', 'tests'].includes(field),
      );
    }
    if (module.paths.length === 0) throw new Error(`${module.name}.paths must not be empty`);
    if (module.tests.length === 0) throw new Error(`${module.name}.tests must not be empty`);
    if (module.forbiddenImports.length === 0) {
      throw new Error(`${module.name}.forbiddenImports must not be empty`);
    }
    if (module.status === 'modular' && module.publicEntrypoints.length === 0) {
      throw new Error(`${module.name} is modular but has no public entrypoint`);
    }
    for (const [index, route] of module.backendRoutes.entries()) {
      if (!route || typeof route !== 'object' || Array.isArray(route)) {
        throw new Error(`${module.name}.backendRoutes[${index}] must be an object`);
      }
      nonEmptyString(route.method, `${module.name}.backendRoutes[${index}].method`);
      nonEmptyString(route.path, `${module.name}.backendRoutes[${index}].path`);
    }
  }

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
    physicalModuleDirectories: physicalDirectories.length,
  };
}

export function findModuleForFile(catalog, file) {
  const normalizedFile = normalizeRepositoryPath(file);
  return catalog.modules
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
  return catalog.modules.filter(module => {
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
    console.log(`[architecture-catalog] ok modules=${summary.modules} modular=${summary.modular} transitional=${summary.transitional}`);
    return;
  }
  if (command === 'map') {
    for (const module of catalog.modules) {
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
  const module = catalog.modules.find(entry => entry.name === args[0]);
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
